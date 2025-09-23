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
    devServer: function(configFunction) {
        return function(proxy, allowedHost) {
            const config = configFunction(proxy, allowedHost);

            // 确保 allowedHosts 包含非空字符串
            config.allowedHosts = ['localhost'];

            return config;
        };
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

        // 忽略源码映射解析告警
        const smWarning = /Failed to parse source map/;
        config.ignoreWarnings = Array.isArray(config.ignoreWarnings)
            ? [...config.ignoreWarnings, smWarning]
            : [smWarning];

        // 将 source-map-loader 排除对部分第三方包的处理
        const sourceMapExcludes = [
            /node_modules[\\/]@solana[\\/]buffer-layout/,
            /node_modules[\\/]superstruct/,
        ];
        const addExcludeForSourceMapLoader = (rules) => {
            if (!Array.isArray(rules)) return;
            for (const rule of rules) {
                if (!rule) continue;
                // 直接 loader 形式
                if (rule.loader && String(rule.loader).includes('source-map-loader')) {
                    rule.exclude = Array.isArray(rule.exclude)
                        ? [...rule.exclude, ...sourceMapExcludes]
                        : sourceMapExcludes;
                }
                // use 数组形式
                if (rule.use) {
                    const uses = Array.isArray(rule.use) ? rule.use : [rule.use];
                    uses.forEach((u) => {
                        if (u && u.loader && String(u.loader).includes('source-map-loader')) {
                            u.exclude = Array.isArray(u.exclude)
                                ? [...u.exclude, ...sourceMapExcludes]
                                : sourceMapExcludes;
                        }
                    });
                }
                if (rule.oneOf) addExcludeForSourceMapLoader(rule.oneOf);
                if (rule.rules) addExcludeForSourceMapLoader(rule.rules);
            }
        };
        addExcludeForSourceMapLoader(config.module && config.module.rules);

        return config;
    }
};
