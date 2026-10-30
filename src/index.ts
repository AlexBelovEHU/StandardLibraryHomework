import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function main(): Promise<void> {
	const [, , sourceArgument, backupArgument] = process.argv;
	if (!sourceArgument || !backupArgument) {
		console.error("Usage: ts-node ./src/index.ts <sourceDir> <backupDir>");
		process.exitCode = 1;
		return;
	}

	const sourceDir = path.resolve(sourceArgument);
	const backupDir = path.resolve(backupArgument);
	const logPath = path.join(backupDir, "backup_log.txt");

	try {
		await fs.mkdir(backupDir, { recursive: true });

		const entries = await fs.readdir(sourceDir, { withFileTypes: true });
		const fileNames = entries
			.filter((entry) => entry.isFile())
			.map((entry) => entry.name)
			.sort();
		const currentHash = createHash("sha256")
			.update(JSON.stringify(fileNames))
			.digest("hex");

		let previousHash: string | undefined;
		try {
			const contents = await fs.readFile(logPath, "utf8");
			for (const line of contents.split(/\r?\n/)) {
				const match = /^HASH: ([a-f\d]+)$/.exec(line);
				if (match) previousHash = match[1];
			}
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;//no such file or directory
		}

		if (previousHash === currentHash) {
			await fs.appendFile(
				logPath,
				`${new Date().toISOString()}: SKIPPED: No changes detected\n`,
			);
			return;
		}

		const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
		const backupPath = path.join(backupDir, `backup-${timestamp}.tar.gz`);

		try {
			await execFileAsync("tar", ["-czf", backupPath, "-C", sourceDir, "."]);
		} catch {
			await fs.rm(backupPath, { force: true });
			await fs.appendFile(
				logPath,
				`${new Date().toISOString()}: :d sad\n`,
			);
			process.exitCode = 1;
			return;
		}

		await fs.appendFile(
			logPath,
			`${new Date().toISOString()}: :D happy\nHASH: ${currentHash}\n`,
		);
	} catch {
		try {
			await fs.appendFile(
				logPath,
				`${new Date().toISOString()}: :d sad\n`,
			);
		} catch {
		}
		process.exitCode = 1;
	}
}

void main();
