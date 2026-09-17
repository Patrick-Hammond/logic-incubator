const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const TsconfigPathsPlugin = require('tsconfig-paths-webpack-plugin');

// Each project builds to its own dist/<project> folder (assets nested inside
// as dist/<project>/assets), so multiple projects can be hosted side by side
// under matching /<project>/ paths on the same origin. Select one with
// `--env project=<name>` (see the per-project npm scripts in package.json).
const PROJECTS = {
  dungeon: {
    entry: './src/dungeon/main.ts',
    title: 'In Dungeons We Dwell',
    assets: './src/dungeon/assets'
  },
  catgrab: {
    entry: './src/catgrab/main.ts',
    title: 'Cat Grab',
    assets: './src/catgrab/assets'
  }
};

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';
  const projectName = (env && env.project) || 'dungeon';
  const project = PROJECTS[projectName];

  if (!project) {
    throw new Error(`Unknown project "${projectName}". Valid projects: ${Object.keys(PROJECTS).join(', ')}`);
  }

  const outputPath = path.resolve(__dirname, 'dist', projectName);

  return {
    entry: project.entry,
    mode: isProduction ? 'production' : 'development',
    devtool: isProduction ? false : 'source-map',
    target: ['web', 'es5'],
    devServer: {
      static: { directory: outputPath },
      hot: true,
      port: 4200,
      open: [`/${projectName}/`]
    },
    plugins: [
      new HtmlWebpackPlugin({
        title: project.title,
        template: './src/_lib/html/index.template'
      }),
      new CopyWebpackPlugin({
        patterns: [
          { from: project.assets, to: 'assets' },
          { from: './src/_lib/html/index.styles.css', to: 'index.styles.css' }
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
        },
        {
          test: /\.(vert|frag)$/,
          type: 'asset/source'
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
      path: outputPath,
      publicPath: `/${projectName}/`,
      clean: true
    },
    // This is a canvas game; a large single bundle is expected.
    performance: { hints: false }
  };
};
