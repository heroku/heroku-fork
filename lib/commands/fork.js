'use strict';
let co              = require('co');
let prompt          = require('co-prompt');
let Heroku          = require('heroku-client');
let ForkError       = require('../errors').ForkError;
let AppsService      = require('../services/apps');
let AddonsService    = require('../services/addons');
let PostgresService = require('../services/postgres');
var heroku, newAppName;

function onerror(err) {
  if (err instanceof ForkError) {
    console.error(err.message);
    process.exit(1);
  }
  process.stdout.write(`\n${err.stack}\n\n`);
  if (newAppName) {
    console.error(`There was an error forking to ${newAppName}.`);
    console.error(`In order to avoid being charged for any resources on ${newAppName}, would you like to destroy the failed fork?`);
    co(function* () {
      let destroy = yield prompt.confirm(`(y/n): `);
      if (destroy) {
        process.stdout.write(`Destroying app ${newAppName}... `);
        yield heroku.apps(newAppName).delete();
        console.error(`done`);
      }
      process.exit(1);
    }).catch(function (err) {
      console.error(`\n${err.stack}\n`);
      console.error(`Error destroying app ${newAppName}.`);
      console.error(`You should remove it manually to avoid being charged for any resources on it.`);
      process.exit(1);
    });
  }
}

module.exports = {
  topic: '_fork',
  needsAuth: true,
  needsApp: true,
  help: `Fork an existing app -- copy config vars and Heroku Postgres data, and re-provision add-ons to a new app.
New app name should not be an existing app. The new app will be created as part of the forking process.`,
  flags: [{name: 'stack', char: 's', hasValue: true}],
  args: [{name: 'new_app_name', optional: true}],
  run: function (context) {
    co(function* () {
      heroku = new Heroku({token: context.auth.password});
      let apps = new AppsService(heroku);
      let postgres = new PostgresService(heroku);
      let addons = new AddonsService(heroku, postgres);

      let oldApp = yield apps.getApp(context.app);
      let slug   = yield apps.getLastSlug(oldApp);
      let newApp = yield apps.createNewApp(oldApp, context.args.new_app_name, context.args.stack);
      newAppName = newApp.name;
      yield apps.copySlug(newApp, slug);
      yield addons.copyAddons(oldApp, newApp);
      yield addons.copyConfigVars(oldApp, newApp);

      console.log(`Fork complete. View it at ${newApp.web_url}`);
    }).catch(onerror);
  }
};
