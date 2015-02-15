'use strict';
let co = require('co');
let prompt = require('co-prompt');
let Heroku = require('heroku-client');
var heroku, oldApp, newApp;

function writeErr() {
  process.stderr.write(Array.prototype.slice.call(arguments, 0).join());
}

function* destroyNewApp() {
  writeErr(`There was an error forking ${oldApp.name} to ${newApp.name}.\n`);
  writeErr(`In order to avoid being charged for any resources on ${newApp.name}, `);
  writeErr(`would you like to destroy the failed fork?\n`);
  writeErr(`(This will not do anything to ${oldApp.name}.)\n`);
  let destroy = yield prompt.confirm(`(y/n): `);
  if (destroy) {
    writeErr(`destroying app ${newApp.name}...`);
    yield heroku.apps(newApp.name).delete();
    writeErr(` done\n`);
  }
  process.exit(1);
}

module.exports = {
  topic: '_fork',
  needsAuth: true,
  needsApp: true,
  run: function (context) {
    co(function *() {
      heroku = new Heroku({token: context.auth.password});
      oldApp = yield heroku.apps(context.app).info();
      writeErr(`forking ${oldApp.name}...`);
      newApp = yield heroku.apps().create();
      writeErr(' done\n');
      console.log(newApp);
      console.log(oldApp);

      // TODO: remove
      yield heroku.apps('sdljfkhdslf').info();
    }).catch(function (err) {
      writeErr(`\n${err.stack}\n\n`);
      if (newApp) {
        co(destroyNewApp)
        .catch(function (err) {
          writeErr(`\n${err.stack}\n\n`);
          writeErr(`Error destroying app ${newApp.name}.\n`);
          writeErr(`You should remove it manually to avoid being charged for any resources on it.\n`);
          process.exit(1);
        });
      }
    });
  }
};
