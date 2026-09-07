const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const TsconfigPathsPlugin = require('tsconfig-paths-webpack-plugin');

module.exports = (_env, argv) => {
  const isProduction = argv.mode === 'production';

  return {
    entry: './src/Main.ts',
    mode: isProduction ? 'production' : 'development',
    devtool: isProduction ? false : 'source-map',
    target: ['web', 'es5'],
    devServer: {
      static: { directory: path.resolve(__dirname, 'dist') },
      hot: true,
      port: 4200
    },
    plugins: [
      new HtmlWebpackPlugin({
        title: 'Symbol Shift',
        template: './src/index.template'
      }),
      new CopyWebpackPlugin({
        patterns: [
          { from: './src/assets', to: 'assets' },
          { from: './src/index.styles.css', to: 'index.styles.css' }
        ]
      })
    ],
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: 'ts-loader',
          exclude: /node_modules/
        },
        {
          test: /\.(png|svg|jpg|gif)$/,
          type: 'asset/resource'
        }
      ]
    },
    resolve: {
      plugins: [
        new TsconfigPathsPlugin({ configFile: './tsconfig.json' })
      ],
      extensions: ['.tsx', '.ts', '.js']
    },
    output: {
      filename: '[name].bundle.js',
      sourceMapFilename: '[file].map[query]',
      path: path.resolve(__dirname, 'dist'),
      clean: true
    },
    // This is a canvas game; a large single bundle is expected.
    performance: { hints: false }
  };
};
