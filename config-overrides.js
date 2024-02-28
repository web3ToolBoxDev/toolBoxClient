const path = require('path');
module.exports = {
    paths: function (paths, env) {
        // Changing public to static
        paths.appPublic = path.resolve(__dirname, 'client/public');
        paths.appHtml = path.resolve(__dirname, 'client/public/index.html');
        paths.appIndexJs = path.resolve(__dirname, 'client/src/index.js');
        paths.appSrc = path.resolve(__dirname, 'client/src');
        paths.appBuild = path.resolve(__dirname, 'client/build');

        return paths;
    }
}