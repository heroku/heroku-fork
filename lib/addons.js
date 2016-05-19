'use strict';

let _   = require('lodash');
let cli = require('heroku-cli-util');
let util = require('util');

function ErrorPlanNotFound() {
  Error.call(this);
  Error.captureStackTrace(this, this.constructor);

  this.name = this.constructor.name;
}

util.inherits(ErrorPlanNotFound, Error);

function Addons (heroku, postgres) {
  this.heroku = heroku;
  this.postgres = postgres;
}

Addons.prototype = {
  addAddon: function* (app, addon, attachments) {
    let attachment = attachments.pop();

    let catchShutdown = function(err) {
      if (err.statusCode === 422 && err.body && err.body.id === 'invalid_params') {
        throw new ErrorPlanNotFound();
      } else {
        throw err;
      }
    };
    let request = this.heroku.post(`/apps/${app.name}/addons`, {body: {attachment: {name: attachment.name}, plan: addon.plan.name}}).catch(catchShutdown);

    addon = yield cli.action(`Adding ${cli.color.magenta(addon.plan.name)} to ${cli.color.cyan(app.name)} as ${cli.color.green(attachment.name)}`, request);
    yield this.attachAddon(app, addon, attachments);
    return addon;
  },

  attachAddon: function* (app, addon, attachments) {
    for (let attachment of attachments) {
      let request = this.heroku.post('/addon-attachments', {body: {addon: addon.id, app: app.id, name: attachment.name}});
      yield cli.action(`Attaching ${cli.color.magenta(attachment.name)} from ${cli.color.cyan(addon.app.name)} to ${cli.color.cyan(app.name)} as ${cli.color.green(attachment.name)}`, request);
    }
  },

  copyAddons: function* (oldApp, newApp, skipPG) {
    let data = yield {
      addons:      this.heroku.get(`/apps/${oldApp.name}/addons`),
      attachments: this.heroku.get(`/apps/${oldApp.name}/addon-attachments`),
    };
    for (let addon of data.addons) {
      /*jshint -W083 */
      let attachments = data.attachments.filter(a => a.addon.id === addon.id);
      if (addon.app.name !== oldApp.name) {
        yield this.attachAddon(newApp, addon, attachments);
      } else if (addon.plan.name.startsWith('heroku-postgresql')) {
        if (skipPG) continue;
        let fromConfig = yield this.heroku.get(`/apps/${oldApp.name}/config-vars`);
        let toDB = yield this.addAddon(newApp, addon, attachments);
        let toConfig = yield this.heroku.get(`/apps/${newApp.name}/config-vars`);
        yield this.postgres.migrateDB(fromConfig, addon, toConfig, toDB);
      } else {
        try {
          yield this.addAddon(newApp, addon, attachments);
        } catch(err) {
          if (err instanceof ErrorPlanNotFound) {
            console.error(` ! Adding ${cli.color.magenta(addon.plan.name)} to ${cli.color.cyan(newApp.name)} failed because the addon could not be found!`);
          } else {
            throw err;
          }
        }
      }
    }
  },

  copyConfigVars: function* (oldApp, newApp, skipPG) {
    console.log(`Copying config vars:`);
    let oldConfigVars = yield this.heroku.get(`/apps/${oldApp.name}/config-vars`);
    let newConfigVars = yield this.heroku.get(`/apps/${newApp.name}/config-vars`);
    let keysToKeep = _.difference(Object.keys(oldConfigVars), Object.keys(newConfigVars));
    let configVars = _.reduce(keysToKeep, function (result, key) {
      if (key === 'DATABASE_URL' && skipPG) return result;
      if (key.startsWith('HEROKU_POSTGRESQL_')) {
        // Don't copy other DB urls
        return result;
      }
      result[key] = oldConfigVars[key];
      return result;
    }, {});
    for (var key of Object.keys(configVars)) {
      console.log(`  ${cli.color.green(key)}`);
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
