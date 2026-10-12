import path from 'node:path';
import gulp from 'gulp';
import less from 'gulp-less';

// `--out=<dir>` redirects the build, so it can be compared before touching styles/.
const outArg = process.argv.find((arg) => arg.startsWith('--out='));
const outDir = outArg ? outArg.slice('--out='.length) : 'styles';

const entries = ['styles/less/srd5e.less', 'styles/less/dark-tactical-sheets.less'];

export function css() {
  return gulp
    .src(entries)
    .pipe(less({ paths: [path.resolve('styles/less')] }))
    .pipe(gulp.dest(outDir));
}

export function cssWatch() {
  return gulp.watch('styles/less/**/*.less', css);
}
