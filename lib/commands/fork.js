'use strict';
let co              = require('co');
let Heroku          = require('heroku-client');
let ForkError       = require('../errors').ForkError;
let AppsService      = require('../services/apps');
let AddonsService    = require('../services/addons');
let PostgresService = require('../services/postgres');
var heroku;

function confirmThenDeleteApp(app) {
  console.error(`\nIn order to avoid being charged for any resources on ${app}, it is being destroyed...`);
  co(function* () {
    process.stdout.write(`Destroying app ${app}... `);
    yield heroku.apps(app).delete();
    console.error(`done`);
    process.exit(1);
  }).catch(function (err) {
    console.error(`\n${err.stack}\n`);
    console.error(`Error destroying app ${app}.`);
    console.error(`You should remove it manually to avoid being charged for any resources on it.`);
    process.exit(1);
  });
}

module.exports = {
  topic: '_fork',
  needsAuth: true,
  needsApp: true,
  help: `Fork an existing app -- copy config vars and Heroku Postgres data, and re-provision add-ons to a new app.
New app name should not be an existing app. The new app will be created as part of the forking process.`,
  flags: [
    {name: 'stack', char: 's', description: 'specify a stack for the new app', hasValue: true},
    {name: 'region', description: 'specify a region', hasValue: true},
    {name: 'copy-heroku-postgres-data', description: 'copy database data instead of just creating empty databases', hasValue: false}
  ],
  args: [{name: 'newname', optional: true}],
  run: function (context) {
    let heroku, stopping, newAppName;
    process.on('SIGINT', function () {
      stopping = true;
      confirmThenDeleteApp(newAppName);
    });
    co(function* () {
      heroku = new Heroku({token: context.auth.password});
      let apps = new AppsService(heroku);
      let postgres = new PostgresService(heroku);
      let addons = new AddonsService(heroku, postgres);

      let oldApp = yield apps.getApp(context.app);
      let slug   = yield apps.getLastSlug(oldApp);

      if (stopping) { return; }
      let newApp = yield apps.createNewApp(oldApp, context.args.newname, context.args.stack, context.args.region);
      newAppName = newApp.name;

      if (stopping) { return; }
      yield apps.copySlug(newApp, slug);

      if (stopping) { return; }
      yield addons.copyAddons(oldApp, newApp, !!context.args['copy-data']);

      if (stopping) { return; }
      yield addons.copyConfigVars(oldApp, newApp);

      console.log(`Fork complete. View it at ${newApp.web_url}`);
    }).catch(function (err) {
      if (err instanceof ForkError) {
        console.error(err.message);
        process.exit(1);
      }
      console.error(`\nThere was an error forking to ${newAppName}.`);
      console.error(err.stack);
      if (newAppName) {
        confirmThenDeleteApp(newAppName);
      }
    });
  }
};
