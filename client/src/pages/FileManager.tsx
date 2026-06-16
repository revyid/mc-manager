import { useState, useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { trpc } from "@/lib/trpc";
import CodeEditor from "@/components/CodeEditor";
import {
  File, Folder, ChevronRight, ArrowLeft,
  Upload, Plus, Trash2, RefreshCw, Search, MoreVertical,
  FileText, FileCode, Image, Info, Edit3, FolderPlus,
  X, Loader2, Download, Copy, Scissors, Clipboard, Check,
} from "lucide-react";
import { toast } from "sonner";

interface FileEntry {
  name: string;
  isDirectory: boolean;
  size: number;
  modifiedAt: string;
  ext: string;
}

const BINARY_EXTS = new Set([
  ".jar", ".zip", ".gz", ".tar", ".exe", ".dll", ".so", ".dylib",
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico",
  ".mp3", ".wav", ".ogg", ".mp4", ".webm", ".class",
]);

function getFileIcon(entry: FileEntry) {
  if (entry.isDirectory) return <Folder className="w-4 h-4 text-blue-400" />;
  const ext = entry.ext.toLowerCase();
  if ([".js", ".ts", ".jsx", ".tsx", ".java", ".py", ".sh", ".bat"].includes(ext))
    return <FileCode className="w-4 h-4 text-yellow-400" />;
  if ([".json", ".yml", ".yaml", ".xml", ".toml", ".properties"].includes(ext))
    return <FileCode className="w-4 h-4 text-green-400" />;
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp"].includes(ext))
    return <Image className="w-4 h-4 text-purple-400" />;
  if ([".md", ".txt", ".log", ".cfg", ".conf", ".ini"].includes(ext))
    return <FileText className="w-4 h-4 text-blue-300" />;
  if ([".jar", ".zip"].includes(ext))
    return <File className="w-4 h-4 text-orange-400" />;
  return <File className="w-4 h-4 text-muted-foreground" />;
}

function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

export default function FileManager({ serverId }: { serverId: number }) {
  const [currentPath, setCurrentPath] = useState("");
  const [selectedFile, setSelectedFile] = useState<FileEntry | null>(null);
  const [fileContent, setFileContent] = useState("");
  const [modified, setModified] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [lineCount, setLineCount] = useState(1);
  const [cursorLine, setCursorLine] = useState(1);
  const [clipboard, setClipboard] = useState<{ entry: FileEntry; mode: "copy" | "cut" } | null>(null);

  // Dialogs
  const [newFileDialog, setNewFileDialog] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [newFolderDialog, setNewFolderDialog] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renameDialog, setRenameDialog] = useState<FileEntry | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [infoDialog, setInfoDialog] = useState<FileEntry | null>(null);
  const [fileInfo, setFileInfo] = useState<any>(null);
  const [uploadDialog, setUploadDialog] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState<FileEntry | null>(null);

  const utils = trpc.useUtils();

  const { data: rawEntries = [], isLoading: loading } = trpc.files.list.useQuery(
    { serverId, subpath: currentPath || undefined },
    { enabled: !!serverId }
  );
  const entries = rawEntries as FileEntry[];

  const { data: fileReadData } = trpc.files.read.useQuery(
    { serverId, subpath: selectedFile ? (currentPath ? `${currentPath}/${selectedFile.name}` : selectedFile.name) : "" },
    { enabled: !!selectedFile && !selectedFile.isDirectory && !BINARY_EXTS.has(selectedFile.ext.toLowerCase()) }
  );

  const writeMutation = trpc.files.write.useMutation({
    onSuccess: () => { setModified(false); toast.success("File saved"); },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.files.delete.useMutation({
    onSuccess: () => { toast.success("Deleted"); setSelectedFile(null); setFileContent(""); loadDirectory(currentPath); },
    onError: (e) => toast.error(e.message),
  });

  const mkdirMutation = trpc.files.mkdir.useMutation({
    onSuccess: () => { toast.success("Folder created"); setNewFolderDialog(false); setNewFolderName(""); loadDirectory(currentPath); },
    onError: (e) => toast.error(e.message),
  });

  const uploadMutation = trpc.files.upload.useMutation({
    onSuccess: () => { toast.success("Uploaded"); setUploadDialog(false); loadDirectory(currentPath); },
    onError: (e) => toast.error(e.message),
  });

  const renameMutation = trpc.files.rename.useMutation({
    onSuccess: () => { toast.success("Renamed"); setRenameDialog(null); loadDirectory(currentPath); },
    onError: (e) => toast.error(e.message),
  });

  const moveMutation = trpc.files.move.useMutation({
    onSuccess: () => { toast.success(clipboard?.mode === "cut" ? "Moved" : "Pasted"); setClipboard(null); loadDirectory(currentPath); },
    onError: (e) => toast.error(e.message),
  });

  const copyMutation = trpc.files.copy.useMutation({
    onSuccess: () => { toast.success("Copied"); setClipboard(null); loadDirectory(currentPath); },
    onError: (e) => toast.error(e.message),
  });

  useEffect(() => {
    if (fileReadData && selectedFile) {
      setFileContent((fileReadData as any).content || "");
      setModified(false);
      setLineCount(((fileReadData as any).content || "").split("\n").length);
    }
  }, [fileReadData, selectedFile]);

  const loadDirectory = (subpath: string) => {
    setSelectedFile(null); setFileContent(""); setModified(false);
    setCurrentPath(subpath);
    utils.files.list.invalidate({ serverId, subpath: subpath || undefined });
  };

  const getSubpath = (entry: FileEntry) => currentPath ? `${currentPath}/${entry.name}` : entry.name;

  const openFile = (entry: FileEntry) => {
    if (entry.isDirectory) { loadDirectory(getSubpath(entry)); return; }
    if (BINARY_EXTS.has(entry.ext.toLowerCase())) { toast.info("Binary file - cannot edit"); return; }
    setSelectedFile(entry);
  };

  const saveFile = () => {
    if (!selectedFile) return;
    setSaving(true);
    writeMutation.mutate({ serverId, subpath: getSubpath(selectedFile), content: fileContent }, { onSettled: () => setSaving(false) });
  };

  const handleDownload = async (entry: FileEntry) => {
    if (entry.isDirectory) return;
    try {
      const data = await utils.files.download.fetch({ serverId, subpath: getSubpath(entry) });
      if (data && (data as any).content) {
        const bytes = atob((data as any).content);
        const arr = new Uint8Array(bytes.length);
        for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
        const blob = new Blob([arr]);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url; a.download = entry.name;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success(`Downloaded ${entry.name}`);
      }
    } catch (e: any) { toast.error(e.message || "Download failed"); }
  };

  const handleShowInfo = async (entry: FileEntry) => {
    try {
      const data = await utils.files.info.fetch({ serverId, subpath: getSubpath(entry) });
      setFileInfo(data); setInfoDialog(entry);
    } catch (e: any) { toast.error(e.message); }
  };

  const handlePaste = () => {
    if (!clipboard) return;
    const destDir = currentPath || ".";
    const fromPath = getSubpath(clipboard.entry);
    const toPath = destDir === "." ? clipboard.entry.name : `${destDir}/${clipboard.entry.name}`;
    if (clipboard.mode === "cut") moveMutation.mutate({ serverId, fromPath, toPath });
    else copyMutation.mutate({ serverId, fromPath, toPath });
  };

  const handleUpload = (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      const reader = new FileReader();
      reader.onload = (e) => {
        uploadMutation.mutate({ serverId, subpath: currentPath || ".", fileName: file.name, fileData: e.target?.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  const pathParts = currentPath ? currentPath.split("/") : [];
  const filteredEntries = searchQuery ? entries.filter((e) => e.name.toLowerCase().includes(searchQuery.toLowerCase())) : entries;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-base font-semibold">File Manager</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Browse and edit server files</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {clipboard && (
            <Button variant="outline" size="sm" className="gap-1.5 h-8" onClick={handlePaste}>
              <Clipboard className="w-3.5 h-3.5" /> Paste
            </Button>
          )}
          <Button variant="outline" size="sm" className="gap-1.5 h-8" onClick={() => loadDirectory(currentPath)}>
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 h-8" onClick={() => setUploadDialog(true)}>
            <Upload className="w-3.5 h-3.5" /> Upload
          </Button>
          <Button size="sm" className="gap-1.5 h-8 bg-accent text-white hover:bg-accent/90" onClick={() => setNewFileDialog(true)}>
            <Plus className="w-3.5 h-3.5" /> File
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 h-8" onClick={() => setNewFolderDialog(true)}>
            <FolderPlus className="w-3.5 h-3.5" /> Folder
          </Button>
        </div>
      </div>

      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-xs text-muted-foreground flex-wrap">
        <button className="hover:text-foreground transition-colors font-medium" onClick={() => loadDirectory("")}>Root</button>
        {pathParts.map((part, i) => (
          <span key={i} className="flex items-center gap-1">
            <ChevronRight className="w-3 h-3" />
            <button className="hover:text-foreground transition-colors font-medium" onClick={() => loadDirectory(pathParts.slice(0, i + 1).join("/"))}>{part}</button>
          </span>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search files..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 h-8 text-xs" />
      </div>

      {/* Content */}
      <div className="flex gap-4 min-h-[500px]">
        {/* File List */}
        <div className={`${selectedFile ? "w-1/3 min-w-[280px]" : "w-full"} transition-all`}>
          <Card className="rounded-xl overflow-hidden">
            <ScrollArea className="h-[500px]">
              {loading ? (
                <div className="p-8 text-center text-sm text-muted-foreground">Loading...</div>
              ) : filteredEntries.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">{searchQuery ? "No matching files" : "Empty directory"}</div>
              ) : (
                <div className="divide-y divide-border">
                  {currentPath && (
                    <button className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors text-left"
                      onClick={() => { const p = currentPath.split("/"); p.pop(); loadDirectory(p.join("/")); }}>
                      <ArrowLeft className="w-4 h-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Back</span>
                    </button>
                  )}
                  {filteredEntries.map((entry) => (
                    <div key={entry.name}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors group ${selectedFile?.name === entry.name ? "bg-muted/70" : ""}`}>
                      <button
                        className="flex items-center gap-3 flex-1 min-w-0 text-left"
                        onClick={() => openFile(entry)}
                      >
                        {getFileIcon(entry)}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{entry.name}</p>
                          <p className="text-xs text-muted-foreground">{entry.isDirectory ? "Folder" : formatSize(entry.size)}</p>
                        </div>
                      </button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}>
                            <MoreVertical className="w-3 h-3" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem onClick={() => openFile(entry)}><Edit3 className="mr-2 w-3.5 h-3.5" /> Open</DropdownMenuItem>
                          {!entry.isDirectory && <DropdownMenuItem onClick={() => handleDownload(entry)}><Download className="mr-2 w-3.5 h-3.5" /> Download</DropdownMenuItem>}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => { setRenameDialog(entry); setRenameValue(entry.name); }}><Edit3 className="mr-2 w-3.5 h-3.5" /> Rename</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => { setClipboard({ entry, mode: "copy" }); toast.info(`Copied "${entry.name}"`); }}><Copy className="mr-2 w-3.5 h-3.5" /> Copy</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => { setClipboard({ entry, mode: "cut" }); toast.info(`Cut "${entry.name}"`); }}><Scissors className="mr-2 w-3.5 h-3.5" /> Cut</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleShowInfo(entry)}><Info className="mr-2 w-3.5 h-3.5" /> Properties</DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteDialog(entry)}><Trash2 className="mr-2 w-3.5 h-3.5" /> Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </Card>
        </div>

        {/* Editor */}
        {selectedFile && (
          <div className="flex-1 flex flex-col min-w-0">
            <Card className="rounded-xl flex-1 flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30">
                <div className="flex items-center gap-2 min-w-0">
                  {getFileIcon(selectedFile)}
                  <span className="text-sm font-medium truncate">{selectedFile.name}</span>
                  {modified && <Badge variant="outline" className="text-xs bg-yellow-500/10 text-yellow-500 border-yellow-500/20">Modified</Badge>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Ln {cursorLine}, {lineCount} lines</span>
                  <Button size="sm" variant="outline" className="h-7 gap-1.5" onClick={saveFile} disabled={!modified || saving}>
                    {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Save
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setSelectedFile(null); setFileContent(""); }}>
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
              <CodeEditor
                value={fileContent}
                onChange={(v) => { setFileContent(v); setModified(true); setLineCount(v.split("\n").length); }}
                ext={selectedFile.ext}
              />
            </Card>
          </div>
        )}
      </div>

      {/* Confirm Delete Dialog */}
      <Dialog open={!!deleteDialog} onOpenChange={(open) => { if (!open) setDeleteDialog(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete {deleteDialog?.isDirectory ? "Folder" : "File"}</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{deleteDialog?.name}</strong>? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog(null)}>Cancel</Button>
            <Button variant="destructive" disabled={deleteMutation.isPending} onClick={() => {
              if (deleteDialog) deleteMutation.mutate({ serverId, subpath: getSubpath(deleteDialog) });
              setDeleteDialog(null);
            }}>
              {deleteMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Trash2 className="w-3.5 h-3.5 mr-1.5" />} Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Dialog */}
      <Dialog open={!!renameDialog} onOpenChange={(open) => { if (!open) setRenameDialog(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Rename</DialogTitle></DialogHeader>
          <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} autoFocus onKeyDown={(e) => e.key === "Enter" && renameValue.trim() && renameMutation.mutate({ serverId, subpath: getSubpath(renameDialog!), newName: renameValue.trim() })} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialog(null)}>Cancel</Button>
            <Button onClick={() => renameValue.trim() && renameMutation.mutate({ serverId, subpath: getSubpath(renameDialog!), newName: renameValue.trim() })} disabled={!renameValue.trim() || renameMutation.isPending}>
              {renameMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New File Dialog */}
      <Dialog open={newFileDialog} onOpenChange={setNewFileDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>New File</DialogTitle></DialogHeader>
          <Input placeholder="filename.txt" value={newFileName} onChange={(e) => setNewFileName(e.target.value)} autoFocus onKeyDown={(e) => e.key === "Enter" && newFileName.trim() && writeMutation.mutate({ serverId, subpath: currentPath ? `${currentPath}/${newFileName}` : newFileName, content: "" }, { onSuccess: () => { toast.success("Created"); setNewFileDialog(false); setNewFileName(""); loadDirectory(currentPath); } })} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewFileDialog(false)}>Cancel</Button>
            <Button onClick={() => newFileName.trim() && writeMutation.mutate({ serverId, subpath: currentPath ? `${currentPath}/${newFileName}` : newFileName, content: "" }, { onSuccess: () => { toast.success("Created"); setNewFileDialog(false); setNewFileName(""); loadDirectory(currentPath); } })} disabled={!newFileName.trim()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Folder Dialog */}
      <Dialog open={newFolderDialog} onOpenChange={setNewFolderDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>New Folder</DialogTitle></DialogHeader>
          <Input placeholder="folder-name" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} autoFocus onKeyDown={(e) => e.key === "Enter" && newFolderName.trim() && mkdirMutation.mutate({ serverId, subpath: currentPath ? `${currentPath}/${newFolderName}` : newFolderName })} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewFolderDialog(false)}>Cancel</Button>
            <Button onClick={() => newFolderName.trim() && mkdirMutation.mutate({ serverId, subpath: currentPath ? `${currentPath}/${newFolderName}` : newFolderName })} disabled={!newFolderName.trim()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload Dialog */}
      <Dialog open={uploadDialog} onOpenChange={setUploadDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Upload Files</DialogTitle></DialogHeader>
          <div className="relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer hover:border-accent/50 transition-colors">
            <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">Click to select files or drag & drop</p>
            <input type="file" multiple className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => handleUpload(e.target.files)} />
          </div>
        </DialogContent>
      </Dialog>

      {/* Properties Dialog */}
      <Dialog open={!!infoDialog} onOpenChange={(open) => { if (!open) { setInfoDialog(null); setFileInfo(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Properties</DialogTitle></DialogHeader>
          {fileInfo && (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Name</span><span className="font-medium truncate ml-4">{fileInfo.name}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Path</span><span className="font-mono text-xs truncate ml-4 max-w-[200px]">{fileInfo.path || fileInfo.name}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Type</span><span>{fileInfo.isDirectory ? "Folder" : (fileInfo.ext || "File")}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Size</span><span>{formatSize(fileInfo.size)}</span></div>
              {fileInfo.isDirectory && <>
                <div className="flex justify-between"><span className="text-muted-foreground">Files</span><span>{fileInfo.fileCount}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Subfolders</span><span>{fileInfo.dirCount}</span></div>
              </>}
              <div className="flex justify-between"><span className="text-muted-foreground">Modified</span><span>{formatDate(fileInfo.modifiedAt)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Created</span><span>{formatDate(fileInfo.createdAt)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Permissions</span><span className="font-mono">{fileInfo.permissions}</span></div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
