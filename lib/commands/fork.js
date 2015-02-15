'use strict';
let co        = require('co');
let _         = require('lodash');
let prompt    = require('co-prompt');
let Heroku    = require('heroku-client');
let ForkError = require('../errors').ForkError;
var heroku, oldApp, newApp;




// TODO:
var wait = require('co-wait');

function* createNewApp(info) {
  process.stderr.write(`Forking ${oldApp.name}...\r`);
  let app = yield heroku.apps().create(info);
  yield wait(200);
  console.error(`Forked ${oldApp.name} to ${app.name}.`);
  return app;
}

function* getLastRelease() {
  let releases = yield heroku.request({
    path: `/apps/${oldApp.name}/releases`,
    headers: { 'Range': 'version ..; order=desc;'}
  });
  let release = _.chain(releases)
  .filter('slug')
  .first()
  .value();
  if (!release) {
    throw new ForkError(`No slug for app ${oldApp.name} was found.
Push some code to ${oldApp.name} before forking it.`);
  }
  return release;
}

function* getLastSlug() {
  let release = yield getLastRelease();
  return yield heroku.apps(oldApp.name).slugs(release.slug.id).info();
}

function* copySlug(slug) {
  process.stderr.write(`Deploying ${slug.commit.substring(0,7)} to ${newApp.name}...\r`);
  yield wait(200);
  yield heroku.apps(newApp.name).releases().create({
    slug: slug.id,
    description: `Forked from ${oldApp.name}`
  });
  console.error(`Deployed ${slug.commit.substring(0,7)} to ${newApp.name}.   `);
}

function onerror(err) {
  if (err instanceof ForkError) {
    console.error(err.message);
    process.exit(1);
  }
  process.stderr.write(`\n${err.stack}\n\n`);
  if (newApp) {
    console.error(`There was an error forking ${oldApp.name} to ${newApp.name}.`);
    console.error(`In order to avoid being charged for any resources on ${newApp.name},`);
    console.error(`would you like to destroy the failed fork?`);
    console.error(`(This will not do anything to ${oldApp.name}.)`);
    co(function* () {
      let destroy = yield prompt.confirm(`(y/n): `);
      if (destroy) {
        process.stderr.write(`Destroying app ${newApp.name}...\r`);
        yield heroku.apps(newApp.name).delete();
        console.error(`done.\n`);
      }
      process.exit(1);
    }).catch(function (err) {
      console.error(`\n${err.stack}\n`);
      console.error(`Error destroying app ${newApp.name}.`);
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

      // TODO: remove
      try {
        yield heroku.apps('forkee').delete();
      } catch (err) {
      }

      oldApp = yield heroku.apps(context.app).info();
      let slug = yield getLastSlug();
      newApp = yield createNewApp({
        name: (context.args.new_app_name),
        region: oldApp.region.name,
        stack: (context.args.stack || oldApp.stack.name),
        tier: oldApp.tier
      });
      yield copySlug(slug);
    }).catch(onerror);
  }
};
