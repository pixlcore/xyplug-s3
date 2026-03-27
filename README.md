<p align="center"><img src="https://raw.githubusercontent.com/pixlcore/xyplug-s3/refs/heads/main/logo.png" height="128" alt="S3"/></p>
<h1 align="center">S3 Toolbox</h1>

An AWS S3 event plugin for the [xyOps Workflow Automation System](https://xyops.io). It can upload, download, move, copy, list, grep, and delete files in S3 buckets, and is designed to work naturally with xyOps job input and output files.

## Requirements

- `Node.js`
- `npx`
- AWS credentials with permission to access your target S3 bucket

## Environment Variables

Create a [Secret Vault](https://xyops.io/docs/secrets) in xyOps and assign this Plugin to it. Add:

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`

These should be credentials for an IAM user or role with the minimum S3 permissions needed for your workflow.

## Data Collection

This plugin does not collect, store, or transmit user data anywhere except to the configured AWS S3 service endpoint. AWS may log requests according to their own policies.

## Overview

The plugin exposes a toolset with seven tools:

- [Upload Files](#upload-files)
- [Download Files](#download-files)
- [Delete Files](#delete-files)
- [Move Files](#move-files)
- [Copy Files](#copy-files)
- [List Files](#list-files)
- [Grep Files](#grep-files)

All tools operate on a single configured bucket and region per job run.

## Common Parameters

These parameters are always present regardless of the selected tool:

| Parameter | Required | Description |
|-----------|----------|-------------|
| `Region ID` | Yes | AWS region containing the bucket, e.g. `us-east-1`. |
| `Bucket Name` | Yes | The S3 bucket to operate on. |

## General Notes

- `Remote Path` values are S3 key prefixes. Leave blank to operate at the bucket root.
- For folder-like prefixes, it is best to include a trailing slash, e.g. `incoming/` or `logs/2026/03/`.
- `Filename Pattern` uses glob-style matching and is applied to filenames, not full directory paths.
- `Older Than` and `Newer Than` can be specified as raw seconds or friendly text like `7 days`, `12 hours`, or `30 minutes`.
- `Maximum Files` is especially useful when combined with `Sort`.
- Progress is reported back to xyOps while large transfers are in progress.

## Tool Reference

### Upload Files

Uploads local files into S3.

In normal xyOps usage, if you leave `Local Path` blank, the plugin uploads files from the job temp directory. This means the easiest way to upload files to S3 is to attach them as job inputs or pass them from upstream workflow steps. The user does not need to know where those files live on disk, because xyOps and xySat handle that automatically.

If you do want to upload from a specific directory on the server, you can set `Local Path` explicitly.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `Local Path` | No | Base local directory to upload from. Leave blank to use the job temp directory and any job input files already placed there by xyOps. |
| `Filename Pattern` | No | Optional glob to limit which local files are uploaded. |
| `Remote Path` | No | Base S3 prefix to upload into. Leave blank for the bucket root. |
| `Compress Files (Gzip)` | No | Gzip-compress files during upload. The plugin also appends `.gz` to the destination filename. |
| `Custom S3 Params` | No | JSON object passed to S3 for uploaded objects, for settings such as `ACL`, `StorageClass`, `ContentType`, or `CacheControl`. |

Notes:

- Compression is streamed directly to S3. Files are not written to a temporary `.gz` file first, so disk usage stays low.
- The response returns the uploaded file list in job `data`.

Example custom S3 params:

```json
{
	"ACL": "public-read",
	"StorageClass": "STANDARD_IA"
}
```

Example static asset upload params:

```json
{
	"ContentType": "text/css",
	"CacheControl": "public, max-age=86400"
}
```

### Download Files

Downloads files from S3 to the local machine running the job.

By default, if you leave `Local Path` blank, files are downloaded into the job temp directory. Also by default, `Attach Files` is enabled, which means the downloaded files are attached to the job output and become available to downstream workflow steps.

You can override either behavior:

- Set `Local Path` to save files somewhere else.
- Uncheck `Attach Files` if you want local files only and do not want them attached to job outputs.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `Remote Path` | No | Base S3 prefix to download from. Leave blank for the bucket root. |
| `Filename Pattern` | No | Optional glob to limit which remote files are downloaded. |
| `Local Path` | No | Destination directory on local disk. Leave blank to use the xyOps job temp directory. |
| `Decompress Files (Gunzip)` | No | Automatically gunzip downloaded files and strip a trailing `.gz` from the local filename when present. |
| `Delete Files` | No | Delete the remote S3 files after they are successfully downloaded. |
| `Attach Files` | No | Attach downloaded files to the job output. Enabled by default. |
| `Maximum Files` | No | Limit how many files are downloaded. `0` means no limit. |
| `Sort Files` | No | Sort before downloading: `newest`, `oldest`, `largest`, or `smallest`. Useful with `Maximum Files`. |

Notes:

- This tool returns both the matched file metadata and the total transferred byte count in job `data`.
- `Delete Files` turns the tool into a download-and-consume action, which is useful for queue-like workflows.

### Delete Files

Deletes files from S3.

Use this tool when you want to purge objects matching a prefix, filename pattern, age filter, or size/date ordering strategy.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `Remote Path` | No | Base S3 prefix to delete from. Leave blank for the bucket root. |
| `Filename Pattern` | No | Optional glob to limit which remote files are deleted. |
| `Older Than` | No | Delete only files older than this relative time, e.g. `7 days` or `3600`. |
| `Maximum Files` | No | Limit how many files are deleted. `0` means no limit. |
| `Sort Files` | No | Sort before deleting: `oldest`, `newest`, `largest`, or `smallest`. Useful with `Maximum Files`. |
| `Dry Run` | No | Preview the matched files without actually deleting anything. |

Notes:

- Start with `Dry Run` enabled when building destructive workflows.
- This tool returns the matched file metadata and total byte count in job `data`.

### Move Files

Moves files from one S3 path to another, optionally across buckets.

This is ideal for archive pipelines, inbox-to-processed flows, or lifecycle-style workflows controlled by xyOps.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `Remote Path` | No | Base S3 prefix to move from. |
| `Filename Pattern` | No | Optional glob to limit which remote files are moved. |
| `Destination Path` | No | Base S3 prefix to move files into. Leave blank to preserve the relative path at the destination root. |
| `Destination Bucket` | No | Optional destination bucket. Leave blank to keep the source bucket. |
| `Maximum Files` | No | Limit how many files are moved. `0` means no limit. |
| `Sort Files` | No | Sort before moving: `oldest`, `newest`, `largest`, or `smallest`. |
| `Custom S3 Params` | No | JSON object applied to destination objects, e.g. `ACL` or `StorageClass`. |
| `Dry Run` | No | Preview the matched files without actually moving them. |

Notes:

- Under the hood, an S3 move is a copy followed by a delete.
- If you need destination metadata like `ACL` or `StorageClass`, specify it in `Custom S3 Params`.
- This tool returns the matched file metadata and total byte count in job `data`.

### Copy Files

Copies files from one S3 path to another, optionally across buckets.

Use this for replication, fan-out, staging, publishing, or storage-class transitions where you want to keep the source objects intact.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `Remote Path` | No | Base S3 prefix to copy from. |
| `Filename Pattern` | No | Optional glob to limit which remote files are copied. |
| `Destination Path` | No | Base S3 prefix to copy files into. Leave blank to preserve the relative path at the destination root. |
| `Destination Bucket` | No | Optional destination bucket. Leave blank to keep the source bucket. |
| `Maximum Files` | No | Limit how many files are copied. `0` means no limit. |
| `Sort Files` | No | Sort before copying: `oldest`, `newest`, `largest`, or `smallest`. |
| `Custom S3 Params` | No | JSON object applied to destination objects, e.g. `ACL` or `StorageClass`. |

Notes:

- If you want copied objects to have explicit metadata or a different storage class, specify it in `Custom S3 Params`.
- This tool returns the matched file metadata and total byte count in job `data`.

### List Files

Lists files in S3 and returns metadata without downloading object contents.

This is useful for audits, inventory flows, preflight checks, or driving downstream workflow logic from S3 state.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `Remote Path` | No | Base S3 prefix to list from. Leave blank for the bucket root. |
| `Filename Pattern` | No | Optional glob to limit which remote files are included. |
| `Older Than` | No | Include only files older than this relative time. |
| `Newer Than` | No | Include only files newer than this relative time. |
| `Maximum Files` | No | Limit how many files are returned. `0` means no limit. |
| `Sort Files` | No | Sort before returning metadata: `newest`, `oldest`, `largest`, or `smallest`. |

Output:

- `data.files`: Array of file objects containing `key`, `size`, and `mtime`
- `data.bytes`: Total bytes across all matched files

### Grep Files

Searches inside files stored in S3 using a regular expression.

This tool can stream through large remote files, including gzip-compressed files, and extract only the matching lines. It is especially useful for log processing and incident response workflows.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `Remote Path` | No | Base S3 prefix to search under. Leave blank for the bucket root. |
| `Filename Pattern` | No | Optional glob to limit which remote files are searched. |
| `Match Pattern (Regex)` | Yes | JavaScript regular expression pattern used to match lines inside each file. |
| `Decompress Files (Gunzip)` | No | Automatically gunzip files while searching. Enable this for `.gz` log archives. |
| `Older Than` | No | Search only files older than this relative time. |
| `Newer Than` | No | Search only files newer than this relative time. |
| `Maximum Matches` | No | Stop after this many matching lines have been found. |
| `Output Format` | No | Return results as structured JSON (`data`) or write them into an attached text file (`file`). |

Output behavior:

- `JSON Data`: Returns `data.count` and `data.matches`, where each match contains the matched `line` and its source `file` metadata.
- `Text File`: Writes all matched lines into `matched-lines.txt` and attaches that file to the job output.

Notes:

- Matching is line-based.
- Searching is streamed, so memory usage stays low even for very large objects.
- Compressed `.gz` files can be searched without creating decompressed files on disk first.

## Custom S3 Params

The `Upload Files`, `Move Files`, and `Copy Files` tools support `Custom S3 Params`, which is a raw JSON object passed through to S3 when creating destination objects.

Common examples:

```json
{
	"ACL": "public-read",
	"StorageClass": "STANDARD_IA"
}
```

```json
{
	"ContentType": "application/json",
	"CacheControl": "public, max-age=300"
}
```

Useful keys include:

- `ACL`
- `StorageClass`
- `ContentType`
- `CacheControl`
- `ContentDisposition`
- `ContentEncoding`
- `Metadata`

This is particularly useful when:

- publishing static assets from a workflow
- copying or moving objects into a lower-cost storage tier
- setting HTTP headers on web-facing objects
- forcing a fresh metadata policy on copied objects

## Local Testing

When invoked by xyOps, the plugin expects a single JSON document on STDIN using the xyOps wire protocol. You can simulate this locally by piping JSON into `node index.js`.

Example upload test using the current directory as the local source:

```json
{
	"xy": 1,
	"params": {
		"region": "us-east-1",
		"bucket": "my-bucket",
		"tool": "uploadFiles",
		"localPath": "./",
		"filespec": "*.txt",
		"remotePath": "test-upload/"
	}
}
```

Example download test:

```json
{
	"xy": 1,
	"params": {
		"region": "us-east-1",
		"bucket": "my-bucket",
		"tool": "downloadFiles",
		"remotePath": "test-upload/",
		"localPath": "./downloads/",
		"attach": false
	}
}
```

Example grep test on compressed logs:

```json
{
	"xy": 1,
	"params": {
		"region": "us-east-1",
		"bucket": "my-bucket",
		"tool": "grepFiles",
		"remotePath": "logs/",
		"filespec": "*.log.gz",
		"match": "ERROR|FATAL",
		"decompress": true,
		"output": "data",
		"maxLines": 100
	}
}
```

Run any of the above like this:

```sh
export AWS_ACCESS_KEY_ID="YOUR_AWS_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="YOUR_AWS_SECRET_ACCESS_KEY"
cat sample.json | node index.js
```

Or without a file:

```sh
echo '{"xy":1,"params":{"region":"us-east-1","bucket":"my-bucket","tool":"listFiles","remotePath":"incoming/","filespec":"*.csv"}}' | node index.js
```

## Output Summary

Depending on the selected tool, the plugin returns structured job `data` such as:

- uploaded file paths
- downloaded / moved / copied / deleted file metadata
- total byte counts
- grep match counts and matched lines

For file-producing tools, the plugin can also attach local files to the xyOps job output:

- `Download Files`: attaches downloaded files when `Attach Files` is enabled
- `Grep Files`: attaches `matched-lines.txt` when `Output Format` is set to `Text File`

## License

MIT
