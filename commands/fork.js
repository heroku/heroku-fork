'use strict';

let co         = require('co');
let Apps       = require('../lib/apps');
let Addons     = require('../lib/addons');
let Postgres   = require('../lib/postgres');
let cli        = require('heroku-cli-util');

let stopping;
let fromAppName;
let toAppName;
let deleteAppOnFailure;

function wait(ms) {
  return function(done) {
    setTimeout(done, ms);
  };
}

function deleteApp(app, heroku) {
  co(function* () {
    console.error(`\nIn order to avoid being charged for any resources on ${app}, it is being destroyed...`);
    yield cli.action(`Destroying app ${app}`, heroku.delete(`/apps/${app}`));
    process.exit(1);
  });
}

function handleErr(context, heroku) {
  return function (err) {
    cli.errorHandler({
      exit:    false,
      logPath: context.herokuDir + '/error.log',
    })(err);
    if (deleteAppOnFailure) {
      console.error(`\nThere was an error forking to ${deleteAppOnFailure}.`);
      deleteApp(deleteAppOnFailure, heroku);
    } else {
      process.exit(1);
    }
  };
}

function getFromApp(context) {
  let fromAppName = context.flags.from || context.flags.app;
  if (context.flags.app) {
    cli.warn('Specifying the source app without --from APP is deprecated');
  }
  if (!fromAppName) {
    cli.error('No source app specified.\nSpecify an app to fork from with --from APP');
    return;
  }
  context.app = fromAppName;
  return fromAppName;
}

function getToApp(context) {
  if (context.args.NEWNAME) {
    cli.warn('Specifying the new app without --to APP is deprecated');
  }
  return context.flags.to || context.args.NEWNAME;
}

function* fork (context, heroku) {
  let apps = new Apps(heroku);
  let postgres = new Postgres(heroku);
  let addons = new Addons(heroku, postgres);

  let oldApp = yield apps.getApp(fromAppName);
  let slug   = yield apps.getLastSlug(oldApp);

  if (stopping) { return; }
  let newApp = yield apps.createNewApp(oldApp, toAppName, context.flags.region);
  deleteAppOnFailure = newApp.name;

  if (stopping) { return; }
  yield cli.action('Setting buildpacks', apps.setBuildpacks(oldApp, newApp));

  if (stopping) { return; }
  yield addons.copyAddons(oldApp, newApp, context.flags['skip-pg']);

  if (stopping) { return; }
  yield addons.copyConfigVars(oldApp, newApp, context.flags['skip-pg']);

  if (stopping) { return; }
  yield apps.copySlug(newApp, slug);

  yield wait(2000); // TODO remove this after api #4022

  console.log(`Fork complete. View it at ${cli.color.cyan(newApp.web_url)}`);
}

function* run (context, heroku) {
  fromAppName = getFromApp(context);
  if (!fromAppName) { return; }
  toAppName = getToApp(context);
  if (!toAppName) { return; }
  process.once('SIGINT', function () {
    stopping = true;
    if (deleteAppOnFailure) { deleteApp(toAppName, heroku); }
  });
  try {
    yield fork(context, heroku);
  } catch (err) {
    if (err.body && err.body.id === 'two_factor') throw err;
    handleErr(context, heroku)(err);
  }
}

module.exports = {
  topic: 'fork',
  needsAuth: true,
  description: 'Fork an existing app into a new one',
  help: `Copy config vars and Heroku Postgres data, and re-provision add-ons to a new app.
New app name should not be an existing app. The new app will be created as part of the forking process.

Example:

  $ heroku fork --from my-production-app --to my-development-app`,
  flags: [
    {name: 'region', description: 'specify a region', hasValue: true},
    {name: 'skip-pg', description: 'skip postgres databases', hasValue: false},
    {name: 'from', description: 'app to fork from', hasValue: true},
    {name: 'to', description: 'app to create', hasValue: true},
    {name: 'app', char: 'a', hasValue: true, hidden: true}
  ],
  args: [{name: 'NEWNAME', optional: true, hidden: true}],
  run: cli.command({preauth: true}, co.wrap(run))
};
