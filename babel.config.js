module.exports = function (api) {
  api.cache(true);
  // babel-preset-expo wires up the Reanimated/Worklets plugin itself in SDK 54 —
  // adding it by hand here double-applies it.
  return { presets: ['babel-preset-expo'] };
};
