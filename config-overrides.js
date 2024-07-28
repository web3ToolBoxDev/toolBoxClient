const webpack = require('webpack');
const path = require('path');

module.exports = {
    paths: function (paths, env) {
        paths.appPublic = path.resolve(__dirname, 'client/public');
        paths.appHtml = path.resolve(__dirname, 'client/public/index.html');
        paths.appIndexJs = path.resolve(__dirname, 'client/src/index.js');
        paths.appSrc = path.resolve(__dirname, 'client/src');
        paths.appBuild = path.resolve(__dirname, 'client/build');

        return paths;
    },
    webpack: function (config, env) {
        config.resolve = {
            extensions: ['.js', '.jsx'],
            alias: {
                'process/browser': require.resolve('process/browser'),
            },
            fallback: {
                zlib: require.resolve('browserify-zlib'),
                stream: require.resolve('stream-browserify'),
                crypto: require.resolve('crypto-browserify'),
                assert: require.resolve('assert'),
                http: require.resolve('stream-http'),
                https: require.resolve('https-browserify'),
                os: require.resolve('os-browserify/browser'),
                url: require.resolve('url'),
                process: require.resolve('process/browser'),
            },
        };

        config.plugins.push(
            new webpack.ProvidePlugin({
                Buffer: ['buffer', 'Buffer'],
                process: 'process/browser',
                qs: ['qs', 'default'] // 确保使用默认导出
            })
        );

        return config;
    }
};
