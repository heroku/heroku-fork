'use strict';
var _ = require('lodash');

function Postgres (heroku) {
  this.heroku = heroku;
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
        }).resource.name;
      });
    } else {
      return Promise.resolve(db.name);
    }
  },

  startTransfer: function (fromConfig, fromDB, toConfig, toDB) {
    let fromName  = fromDB.config_vars[0].match(/(.*)_URL/)[1];
    let toName    = toDB.config_vars[0].match(/(.*)_URL/)[1];
    let fromURL   = fromConfig[`${fromName}_URL`];
    let toURL     = toConfig[`${toName}_URL`];
    return function (attachment) {
      console.log(`/client/v11/databases/${attachment}/transfers`);
      console.log(`Transferring ${fromName} to ${toName}...`);
      return this.heroku.request({
        method: 'POST',
        host: `postgres-starter-api.heroku.com`,
        path: `/client/v11/databases/${attachment}/transfers`,
        body: {
          from_url: fromURL,
          from_name: fromName,
          to_url: toURL,
          to_name: toName
        }
      });
    }.bind(this);
  },


  waitForDB: function () {
    let svc = this;
    return function (attachment) {
      return svc.heroku.request({
        method: 'GET',
        host: `postgres-api.heroku.com`,
        path: `/client/v11/databases/${attachment}/wait_status`
      })
      .then(function (response) {
        process.stdout.write(`Status: ${response.message}\r`);
        if (response['waiting?']) {
          return new Promise(function (resolve) {
            setTimeout(function () {
              return resolve(svc.waitForDB()(attachment));
            }, 5000);
          });
        } else {
          console.log(`Status: ${response.message}`);
          return attachment;
        }
      });
    };
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
          process.stdout.write(`Progress: ${processed}mb/${total}mb\r`);
          return new Promise(function (resolve) {
            setTimeout(function () {
              return resolve(svc.waitForTransfer(app)(start));
            }, 5000);
          });
        }
      });
    };
  }
};
module.exports = Postgres;
