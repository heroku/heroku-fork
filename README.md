heroku-fork
===========

Heroku CLI plugin to fork an existing app into a new app.

Commands
========

heroku fork [NEWNAME]
---------------------

Fork an existing app into a new one

`--region` specify a region

`--skip-pg` skip postgres databases

`--from` app to fork from

`--to` app to create

`-a, --app` undefined

```
Copy config vars and Heroku Postgres data, and re-provision add-ons to a new app.
New app name should not be an existing app. The new app will be created as part of the forking process.

Example:

  $ heroku fork --from my-production-app --to my-development-app
```
