#!/usr/bin/env node

// S3 Utility Plugin for xyOps
// Copyright (c) 2026 PixlCore LLC
// MIT License

const fs = require('fs');
const Path = require('path');
const S3 = require('s3-api');
const Perf = require('pixl-perf');
const picomatch = require('picomatch');

const app = {
	
	async run() {
		// read job from STDIN
		const chunks = [];
		for await (const chunk of process.stdin) chunks.push(chunk);
		this.job = JSON.parse( chunks.join('').trim() );
		this.params = this.job.params;
		this.normalizeParams();
		
		console.log(`Setting up S3 with bucket: ${this.params.bucket} in region: ${this.params.region}...`);
		
		// setup s3 instance
		this.s3 = new S3({
			bucket: this.params.bucket,
			region: this.params.region
		});
		
		// setup logging hook
		this.s3.attachLogAgent({
			debug: function(level, msg, data) {
				console.log( msg );
			},
			error: function(code, msg, data) {
				console.log( "Error: " + code + ": " + msg );
			}
		});
		
		// setup perf hook
		this.perf = new Perf();
		this.perf.begin();
		this.s3.attachPerfAgent( this.perf );
		
		// jump to tool handler
		let func = 'tool_' + this.params.tool;
		if (!this[func]) return this.fatal('tool', "Unknown tool: " + this.params.tool);
		
		// let the handler do the rest of the work
		await this[func]();
	},
	
	async tool_uploadFiles() {
		// upload files to s3
		let { files } = await this.s3.uploadFiles({ 
			localPath: this.params.localPath || './', 
			remotePath: this.params.remotePath, 
			filespec: picomatch.makeRe( this.params.filespec || '*' ),
			compress: this.params.compress || false,
			suffix: this.params.compress ? '.gz' : undefined,
			params: this.params.s3params || {},
			progress: this.progress
		});
		
		this.sendFinalResponse({ 
			code: 0, 
			data: { files } 
		});
	},
	
	async tool_downloadFiles() {
		// download files from s3
		let { files, bytes } = await this.s3.downloadFiles({ 
			remotePath: this.params.remotePath, 
			localPath: this.params.localPath || './', 
			filespec: picomatch.makeRe( this.params.filespec || '*' ),
			decompress: this.params.decompress || false,
			strip: this.params.decompress ? /\.gz$/ : undefined,
			max: this.params.max || 0,
			sort: this.params.sort || '',
			delete: this.params.delete || false,
			progress: this.progress
		});
		
		this.sendFinalResponse({ 
			code: 0,
			files: this.params.attach ? files.map( file => Path.resolve( this.params.localPath || './', Path.basename(file.key) ) ) : [], 
			data: { files, bytes } 
		});
	},
	
	async tool_deleteFiles() {
		// delete files in s3
		let { files, bytes } = await this.s3.deleteFiles({ 
			remotePath: this.params.remotePath, 
			filespec: picomatch.makeRe( this.params.filespec || '*' ),
			older: this.params.older || '',
			max: this.params.max || 0,
			sort: this.params.sort || '',
			dry: this.params.dry || false,
			progress: this.progress
		});
		
		this.sendFinalResponse({ 
			code: 0,
			files: files.map( file => Path.basename(file.key) ), 
			data: { files, bytes } 
		});
	},
	
	async tool_moveFiles() {
		// move files in s3
		let { files, bytes } = await this.s3.moveFiles({ 
			remotePath: this.params.remotePath, 
			destPath: this.params.destPath, 
			bucket: this.params.destBucket || '',
			filespec: picomatch.makeRe( this.params.filespec || '*' ),
			max: this.params.max || 0,
			sort: this.params.sort || '',
			params: this.params.s3params || {},
			dry: this.params.dry || false,
			progress: this.progress
		});
		
		this.sendFinalResponse({ 
			code: 0,
			data: { files, bytes } 
		});
	},
	
	async tool_copyFiles() {
		// copy files in s3
		let { files, bytes } = await this.s3.copyFiles({ 
			remotePath: this.params.remotePath, 
			destPath: this.params.destPath, 
			bucket: this.params.destBucket || '',
			filespec: picomatch.makeRe( this.params.filespec || '*' ),
			max: this.params.max || 0,
			sort: this.params.sort || '',
			params: this.params.s3params || {},
			progress: this.progress
		});
		
		this.sendFinalResponse({ 
			code: 0,
			data: { files, bytes } 
		});
	},
	
	async tool_listFiles() {
		// list files in s3
		let { files, bytes } = await this.s3.list({ 
			remotePath: this.params.remotePath, 
			filespec: picomatch.makeRe( this.params.filespec || '*' ),
			older: this.params.older || '',
			newer: this.params.newer || '',
			max: this.params.max || 0,
			sort: this.params.sort || '',
			progress: this.progress
		});
		
		this.sendFinalResponse({ 
			code: 0,
			data: { files, bytes } 
		});
	},
	
	async tool_grepFiles() {
		// grep files in s3
		let mode = this.params.output;
		let matches = [];
		let count = 0;
		
		await this.s3.grepFiles({ 
			remotePath: this.params.remotePath, 
			filespec: picomatch.makeRe( this.params.filespec || '*' ),
			match: new RegExp( this.params.match || '.+' ),
			decompress: this.params.decompress || false,
			maxLines: this.params.maxLines || 0,
			older: this.params.older || '',
			newer: this.params.newer || '',
			
			iterator: function(line, file) {
				count++;
				if (mode == 'data') matches.push({ file, line });
				else fs.appendFileSync( 'matched-lines.txt', line + "\n" );
			}
		});
		
		this.sendFinalResponse({ 
			code: 0,
			files: (mode == 'file') ? ['matched-lines.txt'] : null,
			data: { count, matches } 
		});
	},
	
	normalizeParams() {
		// S3 keys are object names, not filesystem paths.  A leading slash is
		// treated as a real key character by S3, but users often type paths like
		// "/incoming/" from habit.  Normalize S3 prefix params once up front so
		// all tools share the same friendly behavior.
		let params = this.params;
		if (params.remotePath) params.remotePath = this.normalizeS3Path( params.remotePath );
		if (params.destPath) params.destPath = this.normalizeS3Path( params.destPath );
	},
	
	normalizeS3Path(path) {
		// Strip only leading slashes.  Interior and trailing slashes are meaningful
		// for folder-like S3 prefixes, so preserve them exactly as entered.
		return String(path).replace(/^\/+/, '');
	},
	
	progress(prog) {
		// send progress updates to xyops
		if (prog.loaded && prog.total) {
			console.log( JSON.stringify({ xy: 1, progress: prog.loaded / prog.total }) );
		}
	},
	
	fatal(code, description) {
		// Emit an error response and exit.
		return this.sendFinalResponse({ code, description });
	},
	
	sendFinalResponse(payload) {
		// Emit a final XYWP message and exit.
		payload.xy = 1;
		if (this.perf) {
			this.perf.end();
			payload.perf = this.perf.metrics();
		}
		process.stdout.write(`${JSON.stringify(payload)}\n`, () => process.exit(0));
	}
};

app.run().catch((err) => {
	// Catch-all handler for unexpected errors.
	console.error( err );
	return app.fatal("error", err && err.message ? err.message : "Unknown error");
});
