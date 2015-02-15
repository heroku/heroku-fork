'use strict';
let co = require('co');
let prompt = require('co-prompt');
let Heroku = require('heroku-client');
let ForkError = require('../errors').ForkError;
var heroku, oldApp, newApp;

function writeErr() {
  process.stderr.write(Array.prototype.slice.call(arguments, 0).join());
}

function* createNewApp(info) {
  writeErr(`Forking ${oldApp.name}... `);
  let app = yield heroku.apps().create(info);
  writeErr(`done. Forked to ${app.name}.\n`);
  return app;
}

function* getLastRelease(app) {
  let releases = yield heroku.apps(app.name).releases().list();
  releases = releases.filter(function (release) {
    return release.slug;
  });
  if (releases.length === 0) {
    throw new ForkError(`No slug for app ${app.name} was found.
Push some code to ${app.name} before forking it.`);
  }
  return releases.pop();
}

function* getLastSlug(app) {
  let release = yield getLastRelease(app);
  return yield heroku.apps(app.name).slugs(release.slug.id).info();
}

function* copySlug() {
}

function onerror(err) {
  if (err instanceof ForkError) {
    console.error(err.message);
    process.exit(1);
  }
  writeErr(`\n${err.stack}\n\n`);
  if (newApp) {
    writeErr(`There was an error forking ${oldApp.name} to ${newApp.name}.\n`);
    writeErr(`In order to avoid being charged for any resources on ${newApp.name}, `);
    writeErr(`would you like to destroy the failed fork?\n`);
    writeErr(`(This will not do anything to ${oldApp.name}.)\n`);
    co(function* () {
      let destroy = yield prompt.confirm(`(y/n): `);
      if (destroy) {
        writeErr(`Destroying app ${newApp.name}... `);
        yield heroku.apps(newApp.name).delete();
        writeErr(`done.\n`);
      }
      process.exit(1);
    }).catch(function (err) {
      writeErr(`\n${err.stack}\n\n`);
      writeErr(`Error destroying app ${newApp.name}.\n`);
      writeErr(`You should remove it manually to avoid being charged for any resources on it.\n`);
      process.exit(1);
    });
  }
}

module.exports = {
  topic: '_fork',
  needsAuth: true,
  needsApp: true,
  flags: [{name: 'stack', char: 't', hasValue: true}],
  run: function (context) {
    co(function* () {
      heroku = new Heroku({token: context.auth.password});
      oldApp = yield heroku.apps(context.app).info();
      let lastSlug = yield getLastSlug(oldApp);
      console.log(lastSlug);


      return;
      newApp = yield createNewApp({
        region: oldApp.region.name,
        stack: (context.args.stack || oldApp.stack.name),
        tier: oldApp.tier
      });
      yield copySlug();

      writeErr(`Forking ${oldApp.name}...`);

      // TODO: remove
      yield heroku.apps(newApp.name).delete();
      console.log('deleted fork');
    }).catch(onerror);
  }
};
