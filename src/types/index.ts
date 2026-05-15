export interface AuthUser {
  id: number;
  username: string;
  role: "admin" | "user";
}

export interface SSHConfig {
  id?: number;
  label?: string;
  host: string;
  username: string;
  password?: string;
  ssh_key?: string;
  auth_type?: "password" | "key";
  port: number;
  group_id?: number | null;
}

export interface FileItem {
  name: string;
  type: "dir" | "file" | "link";
  size: number;
  modified: string | null;
  permissions: string;
}

export interface Metrics {
  cpuTemp: number;
  gpuTemp: number;
  memTotal: number;
  memUsed: number;
  cpuUsage: number;
  disks: { source: string; size: string; used: string; avail: string; mount: string }[];
}

export interface SidebarDir {
  path: string;
  depth: number;
  label: string;
}

export interface AuditRow {
  id: number;
  user_id: number | null;
  username: string | null;
  action: string;
  target: string | null;
  detail: string | null;
  ip: string | null;
  created_at: number;
}

export interface UserRow {
  id: number;
  username: string;
  role: string;
  created_at: number;
  last_login: number | null;
}

export interface GroupRow {
  id: number;
  name: string;
  description: string | null;
  members: { id: number; username: string; role: string }[];
}

export interface PermRow {
  id: number;
  target_type: string;
  target_id: number;
  config_id: number | null;
  can_read: number;
  can_write: number;
  can_delete: number;
  can_terminal: number;
  can_upload: number;
}

export type Theme = "dark" | "light";
export type AdminTab = "users" | "groups" | "configs" | "permissions" | "audit";
