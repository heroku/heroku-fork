'use strict';
let co         = require('co');
let Heroku     = require('heroku-client');
let ForkError  = require('../lib/errors').ForkError;
let Apps       = require('../lib/apps');
let Addons     = require('../lib/addons');
let Postgres   = require('../lib/postgres');
var heroku, newAppName;

function wait(ms) {
  return function(done) {
    setTimeout(done, ms);
  };
}

function deleteApp(app) {
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

function handleErr(err) {
  if (err instanceof ForkError) {
    console.error(err.message);
    process.exit(1);
  }
  if (err.body) {
    if (err.body.message) {
      console.error("\n !  " + err.body.message);
    } else if (err.body.error) {
      console.error("\n !  " + err.body.error);
    }
  } else {
    console.error(err.stack);
  }
  if (newAppName) {
    console.error(`\nThere was an error forking to ${newAppName}.`);
    deleteApp(newAppName);
  } else {
    process.exit(1);
  }
}

process.on('uncaughtException', handleErr);

module.exports = {
  topic: 'fork',
  needsAuth: true,
  needsApp: true,
  help: `Fork an existing app -- copy config vars and Heroku Postgres data, and re-provision add-ons to a new app.
New app name should not be an existing app. The new app will be created as part of the forking process.`,
  flags: [
    {name: 'stack', char: 's', description: 'specify a stack for the new app', hasValue: true},
    {name: 'region', description: 'specify a region', hasValue: true},
    {name: 'skip-pg', description: 'skip postgres databases', hasValue: false}
  ],
  args: [{name: 'newname', optional: true}],
  run: function (context) {
    let stopping;
    process.on('SIGINT', function () {
      if (stopping) { process.exit(1); }
      stopping = true;
      if (newAppName) { deleteApp(newAppName); }
    });
    co(function* () {
      heroku = new Heroku({token: context.auth.password});
      let apps = new Apps(heroku);
      let postgres = new Postgres(heroku);
      let addons = new Addons(heroku, postgres);

      let oldApp = yield apps.getApp(context.app);
      let slug   = yield apps.getLastSlug(oldApp);

      if (stopping) { return; }
      let newApp = yield apps.createNewApp(oldApp, context.args.newname, context.args.stack, context.args.region);
      newAppName = newApp.name;

      if (stopping) { return; }
      yield apps.copySlug(newApp, slug);

      yield wait(2000); // TODO remove this after api #4022
      if (stopping) { return; }
      yield addons.copyAddons(oldApp, newApp, context.args['skip-pg']);

      if (stopping) { return; }
      yield addons.copyConfigVars(oldApp, newApp);

      console.log(`Fork complete. View it at ${newApp.web_url}`);
    }).catch(handleErr);
  }
};
