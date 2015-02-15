function ForkError(message) {
  this.name = "ForkError";
  this.message = (message || "");
}
ForkError.prototype = new Error();

exports.ForkError = ForkError;
