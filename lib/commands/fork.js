module.exports = {
  topic: '_fork',
  run: function (context) {
    console.dir(context);
    console.log('forking...');
  }
};
