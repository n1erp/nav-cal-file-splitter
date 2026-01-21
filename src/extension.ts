import * as vscode from "vscode";
import * as path from "path";
import { splitCalFile } from "./parser";

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand(
    "calFileSplitter.splitCalFile",
    async (resource?: vscode.Uri) => {
      try {
        const fileUri = await resolveTargetFile(resource);
        if (!fileUri) {
          vscode.window.showWarningMessage("No file selected.");
          return;
        }

        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "Splitting CAL file…",
            cancellable: true,
          },
          async (progress, token) => {
            const controller = new AbortController();
            token.onCancellationRequested(() => controller.abort());

            const filePath = fileUri.fsPath;
            const outDir = path.join(
              path.dirname(filePath),
              `src`
            );

            const cfg = vscode.workspace.getConfiguration("calFileSplitter");
            const outputExtension = cfg.get<string>("outputExtension", "txt");

            progress.report({ message: "Preparing output folder…" });
            const { objectCount } = await splitCalFile(
              filePath,
              outDir,
              controller.signal,
              outputExtension
            );

            progress.report({ message: `Wrote ${objectCount} objects` });

            vscode.window
              .showInformationMessage(
                `Split complete: ${objectCount} objects.`,
                "Reveal"
              )
              .then((choice) => {
                if (choice === "Reveal") {
                  vscode.commands.executeCommand(
                    "revealInExplorer",
                    vscode.Uri.file(outDir)
                  );
                }
              });
          }
        );
      } catch (err: any) {
        vscode.window.showErrorMessage(
          `Failed to split CAL file: ${err?.message ?? err}`
        );
      }
    }
  );

  context.subscriptions.push(disposable);
}

export function deactivate() {}

async function resolveTargetFile(resource?: vscode.Uri): Promise<vscode.Uri | undefined> {
  // Prefer resource from context menu, then active editor, then ask user
  if (resource && resource.scheme === "file") return resource;

  const active = vscode.window.activeTextEditor?.document.uri;
  if (active && active.scheme === "file") return active;

  const picked = await vscode.window.showOpenDialog({
    title: "Select CAL export file",
    canSelectMany: false,
    filters: { CAL: ["cal", "txt"], All: ["*"] },
  });
  return picked?.[0];
}
