'use strict';
var _ = require('lodash');

function Postgres (heroku) {
  this.heroku = heroku;
}

Postgres.prototype = {
  migrateDB: function (fromConfig, fromDB, toConfig, toDB) {
    return this.attachmentFor(toDB)
    .then(this.startTransfer(fromConfig, fromDB, toConfig, toDB))
    .then(this.waitForTransfer(toDB.app.name));
  },

  attachmentFor: function (db) {
    return this.heroku.request({
      method: 'GET',
      path: `/apps/${db.app.name}/attachments`,
      headers: {'Accept': 'application/vnd.heroku+json; version=2' }
    })
    .then(function (attachments) {
      return _.find(attachments, function (attachment) {
        return attachment.resource.uuid === db.id;
      });
    });
  },

  startTransfer: function (fromConfig, fromDB, toConfig, toDB) {
    let fromName  = fromDB.config_vars[0].match(/(.*)_URL/)[1];
    let toName    = toDB.config_vars[0].match(/(.*)_URL/)[1];
    let fromURL   = fromConfig[`${fromName}_URL`];
    let toURL     = toConfig[`${toName}_URL`];
    return function (attachment) {
      console.log(`Transferring ${fromName} to ${toName}...`);
      return this.heroku.request({
        method: 'POST',
        host: `postgres-starter-api.heroku.com`,
        path: `/client/v11/databases/${attachment.resource.name}/transfers`,
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
