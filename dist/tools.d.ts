export declare function listFiles(directory?: string): Promise<{
    name: string;
    type: string;
}[]>;
export declare function readFile(filePath: string): Promise<string>;
export declare function writeFile(filePath: string, content: string): Promise<string>;
export declare function editFile(filePath: string, oldText: string, newText: string): Promise<string>;
export declare function runCommand(command: string): Promise<{
    stdout: any;
    stderr: any;
    exitCode: any;
}>;
//# sourceMappingURL=tools.d.ts.map