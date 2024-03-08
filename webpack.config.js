const path = require('path');

module.exports = {
  // 其他配置...
  resolve: {
    fallback: {
      "zlib": require.resolve("browserify-zlib")
    }
  }
};
