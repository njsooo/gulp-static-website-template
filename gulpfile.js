const open = require("open");
const { rimraf } = require("rimraf");
const minimist = require("minimist");
const babelify = require("babelify");
const buffer = require("vinyl-buffer");
const browserify = require("browserify");

const gulp = require("gulp");
const log = require("gulplog");
const tap = require("gulp-tap");
const uglify = require("gulp-uglify");
const rename = require("gulp-rename");
const connect = require("gulp-connect");
const sourcemaps = require("gulp-sourcemaps");
const useref = require("gulp-useref");
const change = require("gulp-change");

const htmlMin = require("gulp-htmlmin");
const postHtml = require("gulp-posthtml");
const postHtmlExtend = require("posthtml-extend");
const postHtmlInclude = require("posthtml-include");

const sass = require("gulp-sass")(require("sass"));

/**
 * Options
 */
const SHOULD_BROWSER_OPEN = true;

/**
 * Variables
 */
const isDev =
  minimist(process.argv.slice(2), {
    string: "env",
    default: { env: process.env.NODE_ENV || "development" },
  }).env === "development";

/**
 * PATH
 */
const PATH_ROOT_HTML = "./src/html";
const PATH_ROOT_SCSS = "./src/scss";
const PATH_ROOT_JS = "./src/js";
const PATH_OUTPUT_DEVELOPMENT = "./test";
const PATH_OUTPUT_PRODUCTION = "./build";
const PATH_OUTPUT = isDev ? PATH_OUTPUT_DEVELOPMENT : PATH_OUTPUT_PRODUCTION;

/**
 * Tasks common in development, production
 */
function clean(cb) {
  rimraf.sync([PATH_OUTPUT_DEVELOPMENT, PATH_OUTPUT_PRODUCTION]);
  cb();
}

function generateHTML() {
  const plugins = [
    postHtmlExtend({
      root: PATH_ROOT_HTML,
      encoding: "utf8",
      slotTagName: "slot",
      fillTagName: "fill",
      tagName: "layout",
    }),
    postHtmlInclude({
      root: PATH_ROOT_HTML,
    }),
  ];

  return gulp
    .src(`${PATH_ROOT_HTML}/pages/*.html`)
    .pipe(postHtml(plugins))
    .pipe(
      // place about.html at about/index.html
      rename(function (path) {
        path.dirname += `/${path.basename}`;
        path.basename = "index";
      })
    )
    .pipe(gulp.dest(PATH_OUTPUT))
    .pipe(connect.reload());
}

function generateCSS() {
  return gulp
    .src(`${PATH_ROOT_SCSS}/pages/**/*.scss`)
    .pipe(sourcemaps.init())
    .pipe(sass.sync({ outputStyle: "compressed" }).on("error", sass.logError))
    .pipe(sourcemaps.write("./"))
    .pipe(gulp.dest(PATH_OUTPUT))
    .pipe(connect.reload());
}

function generateJS() {
  return gulp
    .src(`${PATH_ROOT_JS}/pages/*/main.js`, { read: false })
    .pipe(
      tap(function (file) {
        log.info("bundling " + file.path);

        file.contents = browserify(file.path, {
          debug: true,
          transform: [babelify],
        }).bundle();
      })
    )
    .pipe(buffer())
    .pipe(sourcemaps.init({ loadMaps: true }))
    .on("error", log.error)
    .pipe(sourcemaps.write("./"))
    .pipe(gulp.dest(PATH_OUTPUT))
    .pipe(connect.reload());
}

function copyAssets() {
  return gulp.src("./src/assets/**/*").pipe(gulp.dest(`${PATH_OUTPUT}/assets`));
}

/**
 * Tasks for server
 */
function serve() {
  connect.server({
    root: ["./", PATH_OUTPUT_DEVELOPMENT],
    livereload: true,
    fallback: `${PATH_OUTPUT_DEVELOPMENT}/index`,
  });

  if (SHOULD_BROWSER_OPEN) {
    open("http://localhost:8080/index");
  }
}

function watch() {
  gulp.watch(`${PATH_ROOT_HTML}/**/*.html`, generateHTML);
  gulp.watch(`${PATH_ROOT_SCSS}/**/*.scss`, generateCSS);
  gulp.watch(`${PATH_ROOT_JS}/**/*.js`, generateJS);
}

/**
 * Tasks for production
 */
function extractNodeModulesInHTML() {
  const options = {
    noconcat: true,
    transformPath(filePath) {
      if (filePath.includes("node_modules") === false) {
        return filePath;
      }

      return filePath.slice(filePath.indexOf("node_modules"), filePath.length);
    },
  };

  return gulp
    .src(`${PATH_OUTPUT_PRODUCTION}/*/index.html`)
    .pipe(useref(options))
    .pipe(
      rename((path) => {
        if (path.dirname.includes("node_modules") === false) {
          return path;
        }

        const libName = path.dirname
          .match(/\\(?:.(?!\\))+$/i)[0]
          .replace("\\", "");

        path.dirname = `./lib/${libName}`;
      })
    )
    .pipe(gulp.dest(PATH_OUTPUT_PRODUCTION));
}

function changeSrcInHtml() {
  const replaceText = (content) => {
    return content
      .replace(/\/node_modules/g, "../lib")
      .replace(/\.\.\/\.\.\/assets/, "../assets");
  };

  return gulp
    .src(`${PATH_OUTPUT_PRODUCTION}/*/index.html`)
    .pipe(change(replaceText))
    .pipe(gulp.dest(PATH_OUTPUT_PRODUCTION));
}

function minifyHTML() {
  return gulp
    .src(`${PATH_OUTPUT_PRODUCTION}/*/index.html`)
    .pipe(htmlMin({ collapseWhitespace: true, removeComments: true }))
    .pipe(gulp.dest(PATH_OUTPUT_PRODUCTION));
}

function minifyJS() {
  return gulp
    .src(`${PATH_OUTPUT_PRODUCTION}/*/main.js`)
    .pipe(sourcemaps.init({ loadMaps: true }))
    .pipe(uglify())
    .on("error", log.error)
    .pipe(sourcemaps.write("./"))
    .pipe(gulp.dest(PATH_OUTPUT_PRODUCTION));
}

/**
 * Gulp series
 */
exports.common = gulp.series(
  clean,
  generateHTML,
  generateCSS,
  generateJS,
  copyAssets
);

exports.dev = gulp.series(this.common, gulp.parallel(serve, watch));

exports.build = gulp.series(
  this.common,
  extractNodeModulesInHTML,
  changeSrcInHtml,
  minifyHTML,
  minifyJS
);
