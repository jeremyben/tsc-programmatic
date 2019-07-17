import ts from 'typescript'
import { join, isAbsolute } from 'path'
import { rmrf } from './addons'
import { CreateProgramFromConfigOptions, TsConfig, EmitOptions } from './interfaces'

/**
 * Compile ts files by creating a compilation object using the compiler API and emitting js files.
 * @public
 */
export function build(options: CreateProgramFromConfigOptions & EmitOptions) {
	const program = createProgramFromConfig(options)
	emit(program, options)
}

/**
 * Create a compilation object using the compiler API.
 * @public
 */
export function createProgramFromConfig({
	basePath,
	configFilePath,
	compilerOptions,
	include,
	exclude,
	files,
	extends: extend,
	references,
}: CreateProgramFromConfigOptions) {
	let config: TsConfig = {}

	if (configFilePath) {
		if (!isAbsolute(configFilePath)) configFilePath = join(basePath, configFilePath)
		console.log(`Retrieving ${configFilePath}`)

		const readResult = ts.readConfigFile(configFilePath, ts.sys.readFile)
		if (readResult.error) logDiagnostics([readResult.error], true)

		config = readResult.config
	}

	config.compilerOptions = Object.assign({}, config.compilerOptions, compilerOptions)
	if (include) config.include = include
	if (exclude) config.exclude = exclude
	if (files) config.files = files
	if (extend) config.extends = extend
	if (references) config.references = references

	const { options, fileNames, projectReferences, errors } = ts.parseJsonConfigFileContent(
		config,
		ts.sys,
		basePath,
		undefined,
		configFilePath
	)

	logDiagnostics(errors, true)

	const program = ts.createProgram({
		options,
		rootNames: fileNames,
		projectReferences,
	})

	return program
}

/**
 * Compile Typescript files and emit diagnostics if any, throws an error if it fails.
 * @public
 */
export function emit(program: ts.Program, { betterDiagnostics, clean, basePath }: EmitOptions = {}) {
	if (clean && Array.isArray(clean) && clean.length) {
		console.log('Cleaning files')
		if (basePath) {
			clean.map((path) => (isAbsolute(path) ? path : join(basePath, path))).forEach(rmrf)
		} else {
			clean.forEach(rmrf)
		}
	} else if (clean && !Array.isArray(clean)) {
		const { outDir, outFile, declarationDir } = program.getCompilerOptions()

		if (clean.outDir && outDir) {
			console.log('Cleaning outDir')
			rmrf(outDir)
		}

		if (clean.outFile && outFile) {
			console.log('Cleaning outFile')
			rmrf(outFile)
		}

		if (clean.declarationDir && declarationDir) {
			console.log('Cleaning declarationDir')
			rmrf(declarationDir)
		}
	}

	console.log('Compilation started')
	const { diagnostics, emitSkipped } = program.emit()

	// https://github.com/dsherret/ts-morph/issues/384
	const allDiagnostics = ts.getPreEmitDiagnostics(program).concat(diagnostics)

	logDiagnostics(allDiagnostics, betterDiagnostics)

	if (emitSkipped) throw Error('Compilation failed')

	console.log('Compilation successful')
}

/**
 * @internal
 */
function logDiagnostics(diagnostics: ts.Diagnostic[], better = false) {
	if (!diagnostics.length) return

	const formatHost: ts.FormatDiagnosticsHost = {
		getCanonicalFileName: (path) => path,
		getCurrentDirectory: ts.sys.getCurrentDirectory,
		getNewLine: () => ts.sys.newLine,
	}

	const message = better
		? ts.formatDiagnosticsWithColorAndContext(diagnostics, formatHost)
		: ts.formatDiagnostics(diagnostics, formatHost)

	console.warn(message)
}
