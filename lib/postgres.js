'use strict';

var _ = require('lodash');
var h = require('heroku-cli-util');

function Postgres (heroku) {
  this.heroku = heroku;
}

function isProductionDB(db) {
  let type = db.type || db.plan.name;
  let plan = type.split(':')[1];
  return !_.includes(['dev', 'basic', 'hobby-dev', 'hobby-basic'], plan);
}

Postgres.prototype = {
  migrateDB: function (fromConfig, fromDB, toConfig, toDB) {
    return this.attachmentFor(toDB)
    .then(this.waitForDB())
    .then(this.startTransfer(fromConfig, fromDB, toConfig, toDB))
    .then(this.waitForTransfer(toDB.app.name));
  },

  attachmentFor: function (db) {
    if (db.name.startsWith('heroku-postgresql-')) {
      // non-shareable addon
      return this.heroku.request({
        method: 'GET',
        path: `/apps/${db.app.name}/attachments`,
        headers: {'Accept': 'application/vnd.heroku+json; version=2' }
      })
      .then(function (attachments) {
        return _.find(attachments, function (attachment) {
          return attachment.uuid === db.id;
        }).resource;
      });
    } else {
      return Promise.resolve(db);
    }
  },

  waitForDB: function () {
    let svc = this;
    return function (db) {
      if (!isProductionDB(db)) {
        // do not wait for non-production dbs
        return Promise.resolve(db);
      }
      return svc.heroku.request({
        method: 'GET',
        host: `postgres-api.heroku.com`,
        path: `/client/v11/databases/${db.name}/wait_status`
      })
      .then(function (response) {
        process.stdout.write(`Status: ${response.message}\r`);
        if (response['waiting?']) {
          return new Promise(function (resolve) {
            setTimeout(function () {
              return resolve(svc.waitForDB()(db));
            }, 5000);
          });
        } else {
          console.log(`Status: ${h.color.yellow(response.message)}`);
          return db;
        }
      });
    };
  },

  startTransfer: function (fromConfig, fromDB, toConfig, toDB) {
    let fromName  = fromDB.config_vars[0].match(/(.*)_URL/)[1];
    let toName    = toDB.config_vars[0].match(/(.*)_URL/)[1];
    let fromURL   = fromConfig[`${fromName}_URL`];
    let toURL     = toConfig[`${toName}_URL`];
    return function (db) {
      console.log(`Transferring ${h.color.cyan(fromDB.app.name)}:${h.color.magenta(fromName)} to ${h.color.cyan(toDB.app.name)}:${h.color.magenta(toName)}...`);
      return this.heroku.request({
        method: 'POST',
        host: isProductionDB(db) ? 'postgres-api.heroku.com' : 'postgres-starter-api.heroku.com',
        path: `/client/v11/databases/${db.name}/transfers`,
        body: {
          from_url: fromURL,
          from_name: fromName,
          to_url: toURL,
          to_name: toName
        }
      });
    }.bind(this);
  },

  waitForTransfer: function (app) {
    let svc = this;
    return function (start) {
      return svc.heroku.request({
        method: 'GET',
        host: `postgres-api.heroku.com`,
        path: `/client/v11/apps/${app}/transfers/${start.uuid}`
      })
      .then(function (response) {
        if (response.finished_at) {
          console.log('Progress: done                      ');
        } else {
          let processed = Math.round(response.processed_bytes/1024/1024);
          let total     = Math.round(response.source_bytes/1024/1024);
          process.stdout.write('Progress: ' + h.color.yellow(`${processed}MB/${total}MB`) + '\r');
          return new Promise(function (resolve) {
            setTimeout(function () {
              return resolve(svc.waitForTransfer(app)(start));
            }, 5000);
          });
        }
      })
      .catch(function (err) {
        console.error();
        h.error(err);
        return new Promise(function (resolve) {
          setTimeout(function () {
            return resolve(svc.waitForTransfer(app)(start));
          }, 5000);
        });
      });
    };
  }
};
module.exports = Postgres;
