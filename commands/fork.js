'use strict';

let co         = require('co');
let Apps       = require('../lib/apps');
let Addons     = require('../lib/addons');
let Postgres   = require('../lib/postgres');
let h          = require('heroku-cli-util');

function wait(ms) {
  return function(done) {
    setTimeout(done, ms);
  };
}

function deleteApp(app, heroku) {
  co(function* () {
    console.error(`\nIn order to avoid being charged for any resources on ${app}, it is being destroyed...`);
    yield h.action(`Destroying app ${app}`, heroku.apps(app).delete());
    process.exit(1);
  });
}

module.exports = {
  topic: 'fork',
  needsAuth: true,
  needsApp: true,
  description: 'Fork an existing app into a new one',
  help: `Copy config vars and Heroku Postgres data, and re-provision add-ons to a new app.
New app name should not be an existing app. The new app will be created as part of the forking process.`,
  flags: [
    {name: 'stack', char: 's', description: 'specify a stack for the new app', hasValue: true},
    {name: 'region', description: 'specify a region', hasValue: true},
    {name: 'skip-pg', description: 'skip postgres databases', hasValue: false}
  ],
  args: [{name: 'NEWNAME', optional: true}],
  run: h.command(function* (context, heroku) {
    let stopping, newAppName;
    process.once('SIGINT', function () {
      stopping = true;
      if (newAppName) { deleteApp(newAppName, heroku); }
    });
    let apps = new Apps(heroku);
    let postgres = new Postgres(heroku);
    let addons = new Addons(heroku, postgres);

    let oldApp = yield apps.getApp(context.app);
    let slug   = yield apps.getLastSlug(oldApp);

    if (stopping) { return; }
    let newApp = yield apps.createNewApp(oldApp, context.args.NEWNAME, context.flags.stack, context.flags.region);
    newAppName = newApp.name;

    try {
      if (stopping) { return; }
      yield apps.copySlug(newApp, slug);

      yield wait(2000); // TODO remove this after api #4022
      if (stopping) { return; }
      yield addons.copyAddons(oldApp, newApp, context.flags['skip-pg']);

      if (stopping) { return; }
      yield addons.copyConfigVars(oldApp, newApp);

      console.log(`Fork complete. View it at ${newApp.web_url}`);
    } catch (err) {
      h.errorHandler({
        exit:    false,
        logPath: context.herokuDir + '/error.log',
      })(err);
      if (newAppName) {
        console.error(`\nThere was an error forking to ${newAppName}.`);
        deleteApp(newAppName, heroku);
      } else {
        process.exit(1);
      }
    }
  })
};
