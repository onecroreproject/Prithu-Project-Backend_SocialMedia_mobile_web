module.exports = function (schema) {
  schema.pre(/^find/, function () {
    this._startTime = Date.now();
  });

  schema.post(/^find/, function () {
    const elapsed = Date.now() - this._startTime;
    console.log(`⏱️ ${this.model.modelName}.find took ${elapsed}ms`);
    if (elapsed > 500) {
      console.warn(`⚠️  SLOW QUERY in ${this.model.modelName}: ${elapsed}ms`);
    }
  });
};
