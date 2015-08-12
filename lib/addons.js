'use strict';
var _ = require('lodash');

function Addons (heroku, postgres) {
  this.heroku = heroku;
  this.postgres = postgres;
}

Addons.prototype = {
  addAddon: function* (app, addon) {
    try {
      process.stdout.write(`Adding addon ${addon.plan.name} to ${app.name}... `);
      addon = yield this.heroku.apps(app.name).addons().create({plan: addon.plan.name});
      console.log('done');
      return addon;
    } catch (err) {
      console.error(`Skipped addon ${addon.plan.name}`);
      if (err.body) {
        console.error(` !    ${err.body.message}`);
      } else {
        console.error(err);
      }
    }
  },

  getAddons: function* (app) {
    let addons = yield this.heroku.request({path: `/apps/${app.name}/addons`});
    return _.partition(addons, function (addon) {
      return addon.plan.name.startsWith('heroku-postgresql');
    });
  },

  copyAddons: function* (oldApp, newApp, skipPG) {
    let allAddons = yield this.getAddons(oldApp);
    let pgdbs = allAddons[0];
    let addons = allAddons[1];
    if (addons.length > 0) {
      for (let addon of addons) {
        yield this.addAddon(newApp, addon);
      }
    }
    if (!skipPG && pgdbs.length > 0) {
      let fromConfig = yield this.heroku.apps(oldApp.name).configVars().info();
      for (let db of pgdbs) {
        let toDB = yield this.addAddon(newApp, db);
        if (toDB) {
          let toConfig = yield this.heroku.apps(newApp.name).configVars().info();
          yield this.postgres.migrateDB(fromConfig, db, toConfig, toDB);
        }
      }
    }
  },

  copyConfigVars: function* (oldApp, newApp) {
    console.log(`Copying config vars:`);
    let oldConfigVars = yield this.heroku.apps(oldApp.name).configVars().info();
    let newConfigVars = yield this.heroku.apps(newApp.name).configVars().info();
    let keysToKeep = _.difference(Object.keys(oldConfigVars), Object.keys(newConfigVars));
    let configVars = _.reduce(keysToKeep, function (result, key) {
      if (key.startsWith('HEROKU_POSTGRESQL_')) {
        // Don't copy other DB urls
        return result;
      }
      result[key] = oldConfigVars[key];
      return result;
    }, {});
    for (var key of Object.keys(configVars)) {
      console.log(`  ${key}`);
    }
    process.stdout.write('  ... ');
    yield this.heroku.request({
      method: 'PATCH',
      path: `/apps/${newApp.name}/config-vars`,
      body: configVars
    });
    console.log('done');
  }
};

module.exports = Addons;
