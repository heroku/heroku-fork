heroku-fork
===========

[![Build Status](https://travis-ci.org/heroku/heroku-fork.svg?branch=master)](https://travis-ci.org/heroku/heroku-fork)
[![License](https://img.shields.io/github/license/heroku/heroku-fork.svg)](https://github.com/heroku/heroku-fork/blob/master/LICENSE)

Heroku CLI plugin to fork an existing app into a new app.

Commands
========

heroku fork [NEWNAME]
---------------------

Fork an existing app into a new one

`-s, --stack` specify a stack for the new app

`--region` specify a region

`--skip-pg` skip postgres databases

```
Copy config vars and Heroku Postgres data, and re-provision add-ons to a new app.
New app name should not be an existing app. The new app will be created as part of the forking process.
```
