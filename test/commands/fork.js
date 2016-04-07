'use strict';

let cli      = require('heroku-cli-util');
let nock     = require('nock');
let expect   = require('chai').expect;
let cmd      = require('../../commands/fork');

describe('fork', function() {
    beforeEach(function() { 
      nock.disableNetConnect();
      cli.mockConsole(); 

      nock('https://api.heroku.com')
      .get('/apps/from')
      .reply(200, {
        name: 'from',
        owner: {id: '2345'},
        region: {name: 'us-east'},
        stack: {name: 'cedar'}
      });

      nock('https://api.heroku.com')
      .get('/apps/from/releases')
      .reply(200, [{slug: {id: '1234'}}]);

      nock('https://api.heroku.com')
      .get('/apps/from/slugs/1234')
      .reply(200, {});

      nock('https://api.heroku.com')
      .post('/apps', {
        name: 'to',
        region: 'us-east',
        stack: 'cedar'
      })
      .reply(200, {name: 'to', web_url: 'https://to.herokuapp.com'});

      nock('https://api.heroku.com')
      .get('/apps/from/buildpack-installations')
      .reply(200, []);

      nock('https://api.heroku.com')
      .get('/apps/from/addons')
      .reply(200, [{
        id: '3456',
        app: {name: 'from'},
        plan: {name: 'mandrill:starter'},
        attachment: {name: 'MANDRILL'}
      }]);

      nock('https://api.heroku.com')
      .get('/apps/from/addon-attachments')
      .reply(200, [{
        addon: {id: '3456'},
        name: 'foo'
      }]);

      nock('https://api.heroku.com')
      .get('/apps/from/config-vars')
      .reply(200, {});

      nock('https://api.heroku.com')
      .get('/apps/to/config-vars')
      .reply(200, {});

      nock('https://api.heroku.com')
      .patch('/apps/to/config-vars', {})
      .reply(200, {});

      nock('https://api.heroku.com')
      .post('/apps/to/releases', {description:"Forked from to"})
      .reply(200, {});
    });

    it("does not error out if the plan has shut down", function() {
      nock('https://api.heroku.com')
      .post('/apps/to/addons', {attachment:{}, plan:"mandrill:starter"})
      .reply(422, {
        "id":"invalid_params",
        "message":"Couldn't find either the add-on service or the add-on plan of \"mandrill:starter:notfound\"."
      });

      this.timeout(2500);

      return cmd.run({flags: {from: 'from', to: 'to'}, args: {}}).then(function() {
        expect('Setting buildpacks... done\nAdding mandrill:starter to to as foo... !!!\n').to.equal(cli.stderr);
        expect('').to.equal(cli.stdout);
      });
    });

    it("errors out if the plan could not be provisioned", function() {
      nock('https://api.heroku.com')
      .post('/apps/to/addons', {attachment:{}, plan:"mandrill:starter"})
      .reply(500, {
        "id":"application_error",
        "message":"Everything is on fire"
      });

      this.timeout(2500);

      let thrown = false;
      return cmd.run({flags: {from: 'from', to: 'to'}, args: {}}).catch(function(err) {
        thrown = true;
        expect(500).to.equal(err.statusCode);
        expect('Setting buildpacks... done\nAdding mandrill:starter to to as foo... !!!\n').to.equal(cli.stderr);
        expect('').to.equal(cli.stdout);
      }).then(function() {
        expect(thrown).to.equal(true);
      });
    });
});
