'use strict';
let co        = require('co');
let _         = require('lodash');
let prompt    = require('co-prompt');
let Heroku    = require('heroku-client');
let ForkError = require('../errors').ForkError;
var heroku, oldApp, newApp, org;
var postgresAddons = [];

function* getApp(app) {
  try {
    return yield heroku.apps(app).info();
  } catch(err) {
    if (err.statusCode === 404) {
      console.error(`Couldn't find app ${app}.`);
      process.exit(1);
    } else { throw err; }
  }
}

function* lookupOrg(app) {
  try {
    return yield heroku.request({path: `/organizations/${app.owner.id}`});
  } catch (err) {
    if (err.statusCode === 404) {
      return null;
    } else {
      throw err;
    }
  }
}

function* createNewApp(info) {
  process.stdout.write(`Forking ${oldApp.name}... `);
  try {
    if (org) {
      info.organization = org.name;
      let app = yield heroku.request({
        method: 'POST',
        path: org ? '/organizations/apps' : '/apps',
        body: info
      });
      console.log(`done. Forked to ${app.name} in org ${org.name}`);
      return app;
    } else {
      let app = yield heroku.apps().create(info);
      console.log(`done. Forked to ${app.name}`);
      return app;
    }
  } catch (err) {
    if (err.statusCode === 422 && err.body.message === 'Name is already taken') {
      console.error(`app ${info.name} already exists.`);
      process.exit(1);
    } else { throw err; }
  }
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
  process.stdout.write(`Deploying ${slug.commit.substring(0,7)} to ${newApp.name}... `);
  yield heroku.apps(newApp.name).releases().create({
    slug: slug.id,
    description: `Forked from ${oldApp.name}`
  });
  console.log('done');
}

function* copyAddons() {
  console.log('Copying addons:');
  let addons = yield heroku.apps(oldApp.name).addons().list();
  for (let addon of addons) {
    if (addon.plan.name.startsWith('heroku-postgresql')) {
      // deal with postgres addons later
      postgresAddons.push(addon);
      continue;
    }
    process.stdout.write(`  ${addon.plan.name}... `);
    try {
      yield heroku.apps(newApp.name).addons().create({plan: addon.plan.name});
    } catch (err) {
      console.error(`Skipped addon ${addon.plan.name}`);
      console.error(err);
    }
    console.log('done');
  }
}

function* copyPostgres(addons) {
  console.log('Copying PostgreSQL database');
  console.dir(addons);
}

function* copyConfigVars() {
  console.log(`Copying config vars:`);
  let oldConfigVars = yield heroku.apps(oldApp.name).configVars().info();
  let newConfigVars = yield heroku.apps(newApp.name).configVars().info();
  let keysToKeep = _.difference(Object.keys(oldConfigVars), Object.keys(newConfigVars));
  let configVars = _.reduce(keysToKeep, function (result, key) {
    result[key] = oldConfigVars[key];
    return result;
  }, {});
  for (var key of Object.keys(configVars)) {
    console.log(`  ${key}`);
  }
  process.stdout.write('  ... ');
  yield heroku.request({
    method: 'PATCH',
    path: `/apps/${newApp.name}/config-vars`,
    body: configVars
  });
  console.log('done');
}

function onerror(err) {
  if (err instanceof ForkError) {
    console.error(err.message);
    process.exit(1);
  }
  process.stdout.write(`\n${err.stack}\n\n`);
  if (newApp) {
    console.error(`There was an error forking ${oldApp.name} to ${newApp.name}.`);
    console.error(`In order to avoid being charged for any resources on ${newApp.name}, would you like to destroy the failed fork?`);
    console.error(`(This will not do anything to ${oldApp.name}.)`);
    co(function* () {
      let destroy = yield prompt.confirm(`(y/n): `);
      if (destroy) {
        process.stdout.write(`Destroying app ${newApp.name}... `);
        yield heroku.apps(newApp.name).delete();
        console.error(`done`);
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

      oldApp = yield getApp(context.app);
      org = yield lookupOrg(oldApp);
      let slug = yield getLastSlug();
      newApp = yield createNewApp({
        name: context.args.new_app_name,
        region: oldApp.region.name,
        stack: (context.args.stack || oldApp.stack.name),
        tier: oldApp.tier
      });
      yield copySlug(slug);
      yield copyAddons();
      if (postgresAddons.length > 0) {
        yield copyPostgres(postgresAddons);
      }
      yield copyConfigVars();

      console.log(`Fork complete. View it at ${newApp.web_url}`);
    }).catch(onerror);
  }
};
