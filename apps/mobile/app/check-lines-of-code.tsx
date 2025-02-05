"use server";

import { Text } from "react-native";
import { exec } from "child_process";

export default async function GetCloc() {
  const command =
    "cloc . --exclude-dir=node_modules,.next,dist,.turbo,.git,vendor --exclude-ext=yaml,json,svg,__build --vcs git";

  const result = await new Promise<string>((resolve, reject) => {
    exec(command, (error: any, stdout: any, stderr: any) => {
      if (error) {
        console.error(`Error executing cloc: ${error}`);
        reject(error);
        return;
      }
      if (stderr) {
        console.error(`cloc stderr: ${stderr}`);
      }
      resolve(stdout);
    });
  });

  return <Text>{result}</Text>;
}
