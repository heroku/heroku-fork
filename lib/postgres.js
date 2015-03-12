'use strict';
var request = require('request');
function Postgres () {}

Postgres.prototype = {
  migrateDB: function (fromConfig, fromDB, toConfig, toDB) {
    let svc = this;
    return new Promise(function (resolve, reject) {
      let fromName  = fromDB.config_vars[0].match(/(.*)_URL/)[1];
      let toName    = toDB.config_vars[0].match(/(.*)_URL/)[1];
      let fromURL   = fromConfig[`${fromName}_URL`];
      let toURL     = toConfig[`${toName}_URL`];
      console.log(`Transferring ${fromName} to ${toName}...`);
      request.post({
        uri: `${fromConfig.PGBACKUPS_URL}/transfers`,
        json: true,
        qs: {
          from_url: fromURL,
          from_name: fromName,
          to_url: toURL,
          to_name: toName,
          expire: true
        }
      }, function (err, response, body) {
        if (err) { reject(err); }
        if (body.errors) {
          reject(body.errors);
        } else {
          resolve(svc.waitForTransfer(fromConfig.PGBACKUPS_URL, body));
        }
      });
    });
  },

  waitForTransfer: function (pgbackupsURL, transfer) {
    let svc = this;
    return new Promise(function (resolve, reject) {
      setTimeout(function () {
        request.get({
          uri: `${pgbackupsURL}/transfers/${transfer.id}`,
          json: true
        }, function (err, response, body) {
          if (err) { reject(err); }
          if (response.statusCode !== 200) {
            reject(body);
          } else if (body.errors) {
            reject(body.errors);
          } else if (body.finished_at) {
            console.log();
            resolve(body);
          } else {
            process.stdout.write(`Progress: ${body.progress}\r`);
            resolve(svc.waitForTransfer(pgbackupsURL, transfer));
          }
        });
      }, 600);
    });
  }
};
module.exports = Postgres;
