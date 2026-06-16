import { useRef, useMemo } from "react";
import Editor, { OnMount, BeforeMount } from "@monaco-editor/react";
import type { editor } from "monaco-editor";

const LANG_MAP: Record<string, string> = {
  ".js": "javascript", ".jsx": "javascript", ".ts": "typescript", ".tsx": "typescript",
  ".json": "json", ".yml": "yaml", ".yaml": "yaml", ".xml": "xml", ".html": "html", ".htm": "html",
  ".css": "css", ".scss": "scss", ".less": "less",
  ".py": "python", ".pyw": "python",
  ".sh": "shell", ".bash": "shell", ".zsh": "shell",
  ".java": "java", ".kt": "kotlin",
  ".c": "c", ".h": "c", ".cpp": "cpp", ".hpp": "cpp",
  ".cs": "csharp", ".go": "go", ".rs": "rust",
  ".sql": "sql", ".md": "markdown",
  ".properties": "properties", ".prop": "properties",
  ".toml": "ini", ".ini": "ini", ".cfg": "ini", ".conf": "ini",
  ".dockerfile": "dockerfile", ".docker": "dockerfile",
  ".txt": "plaintext", ".log": "plaintext", ".env": "plaintext",
  ".mcmeta": "json",
};

function getLanguage(ext: string): string {
  return LANG_MAP[ext.toLowerCase()] || "plaintext";
}

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  ext?: string;
  readOnly?: boolean;
}

const theme: editor.IStandaloneThemeData = {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "", foreground: "d4d4d4" },
    { token: "comment", foreground: "6a9955", fontStyle: "italic" },
    { token: "keyword", foreground: "c586c0" },
    { token: "keyword.control", foreground: "c586c0" },
    { token: "string", foreground: "ce9178" },
    { token: "string.escape", foreground: "d7ba7d" },
    { token: "number", foreground: "b5cea8" },
    { token: "regexp", foreground: "d16969" },
    { token: "type", foreground: "4ec9b0" },
    { token: "class", foreground: "4ec9b0" },
    { token: "function", foreground: "dcdcaa" },
    { token: "variable", foreground: "9cdcfe" },
    { token: "variable.predefined", foreground: "4fc1ff" },
    { token: "constant", foreground: "4fc1ff" },
    { token: "tag", foreground: "569cd6" },
    { token: "attribute.name", foreground: "9cdcfe" },
    { token: "attribute.value", foreground: "ce9178" },
    { token: "delimiter", foreground: "d4d4d4" },
    { token: "delimiter.bracket", foreground: "ffd700" },
  ],
  colors: {
    "editor.background": "#0d1117",
    "editor.foreground": "#d4d4d4",
    "editor.lineHighlightBackground": "#161b2250",
    "editor.selectionBackground": "#264f7880",
    "editor.inactiveSelectionBackground": "#264f7830",
    "editorLineNumber.foreground": "#484f58",
    "editorLineNumber.activeForeground": "#e6edf3",
    "editorCursor.foreground": "#22c55e",
    "editor.selectionHighlightBackground": "#264f7830",
    "editorIndentGuide.background1": "#21262d",
    "editorIndentGuide.activeBackground1": "#30363d",
    "editorBracketMatch.background": "#264f7830",
    "editorBracketMatch.border": "#22c55e60",
    "editorGutter.background": "#0d1117",
    "minimap.background": "#0d1117",
    "scrollbar.shadow": "#00000000",
    "editorOverviewRuler.border": "#0d1117",
    "editorIndentGuide.background": "#21262d",
    "editorIndentGuide.activeBackground": "#30363d",
  },
};

export default function CodeEditor({ value, ext, onChange, readOnly }: CodeEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const lang = useMemo(() => getLanguage(ext || ".txt"), [ext]);

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;

    editor.updateOptions({
      fontSize: 13,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace",
      fontLigatures: true,
      minimap: { enabled: true, maxColumn: 80, renderCharacters: false },
      scrollBeyondLastLine: false,
      smoothScrolling: true,
      cursorBlinking: "smooth",
      cursorSmoothCaretAnimation: "on",
      renderLineHighlight: "all",
      bracketPairColorization: { enabled: true },
      guides: { bracketPairs: true, indentation: true },
      padding: { top: 12, bottom: 12 },
      lineNumbers: "on",
      roundedSelection: true,
      autoIndent: "full",
      formatOnPaste: true,
      formatOnType: true,
      tabSize: 2,
      wordWrap: "on",
      automaticLayout: true,
      suggest: {
        showKeywords: true,
        showSnippets: true,
        showFunctions: true,
        showVariables: true,
      },
    });

    // Auto-close brackets
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      // Save handled by parent
    });
  };

  return (
    <div className="flex-1 overflow-hidden rounded-b-xl">
      <Editor
        height="100%"
        language={lang}
        value={value}
        theme="mc-dark"
        onMount={handleMount}
        beforeMount={(monaco) => {
          monaco.editor.defineTheme("mc-dark", theme);
        }}
        onChange={(v) => onChange(v || "")}
        options={{
          readOnly,
          fontSize: 13,
          fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
          minimap: { enabled: true, maxColumn: 80 },
          scrollBeyondLastLine: false,
          smoothScrolling: true,
          cursorBlinking: "smooth",
          cursorSmoothCaretAnimation: "on",
          renderLineHighlight: "all",
          bracketPairColorization: { enabled: true },
          guides: { bracketPairs: true, indentation: true },
          padding: { top: 12, bottom: 12 },
          lineNumbers: "on",
          roundedSelection: true,
          autoIndent: "full",
          tabSize: 2,
          wordWrap: "on",
          automaticLayout: true,
        }}
        loading={
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            Loading editor...
          </div>
        }
      />
    </div>
  );
}
