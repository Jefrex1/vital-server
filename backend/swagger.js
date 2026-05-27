'use strict';

const swaggerSpec = {
  "openapi": "3.0.0",
  "info": {
    "title": "oServer API",
    "version": "2.0.0",
    "description": "SSH File Manager & Terminal API"
  },
  "servers": [
    {
      "url": "http://localhost:3001"
    }
  ],
  "components": {
    "securitySchemes": {
      "bearerAuth": {
        "type": "http",
        "scheme": "bearer",
        "bearerFormat": "JWT"
      }
    },
    "schemas": {
      "Error": {
        "type": "object",
        "properties": {
          "error": {
            "type": "string"
          }
        }
      },
      "Ok": {
        "type": "object",
        "properties": {
          "ok": {
            "type": "boolean",
            "example": true
          }
        }
      },
      "SshTarget": {
        "type": "object",
        "description": "Use either configId OR manual connection fields",
        "properties": {
          "configId": {
            "type": "integer"
          },
          "host": {
            "type": "string"
          },
          "port": {
            "type": "integer",
            "default": 22
          },
          "username": {
            "type": "string"
          },
          "password": {
            "type": "string"
          },
          "ssh_key": {
            "type": "string"
          },
          "auth_type": {
            "type": "string",
            "enum": [
              "password",
              "key"
            ]
          }
        }
      },
      "FileItem": {
        "type": "object",
        "properties": {
          "name": {
            "type": "string"
          },
          "type": {
            "type": "string",
            "enum": [
              "file",
              "dir",
              "link"
            ]
          },
          "size": {
            "type": "integer"
          },
          "modified": {
            "type": "string",
            "format": "date-time",
            "nullable": true
          },
          "permissions": {
            "type": "string",
            "example": "drwxr-xr-x"
          }
        }
      },
      "User": {
        "type": "object",
        "properties": {
          "id": {
            "type": "integer"
          },
          "username": {
            "type": "string"
          },
          "role": {
            "type": "string",
            "enum": [
              "user",
              "admin"
            ]
          },
          "created_at": {
            "type": "integer"
          },
          "last_login": {
            "type": "integer",
            "nullable": true
          }
        }
      },
      "SshConfig": {
        "type": "object",
        "properties": {
          "id": {
            "type": "integer"
          },
          "label": {
            "type": "string"
          },
          "host": {
            "type": "string"
          },
          "port": {
            "type": "integer"
          },
          "username": {
            "type": "string"
          },
          "auth_type": {
            "type": "string",
            "enum": [
              "password",
              "key"
            ]
          },
          "password": {
            "type": "string",
            "nullable": true,
            "example": "[PASSWORD SET]"
          },
          "ssh_key": {
            "type": "string",
            "nullable": true,
            "example": "[KEY SET]"
          },
          "owner_id": {
            "type": "integer",
            "nullable": true
          },
          "group_id": {
            "type": "integer",
            "nullable": true
          }
        }
      },
      "Group": {
        "type": "object",
        "properties": {
          "id": {
            "type": "integer"
          },
          "name": {
            "type": "string"
          },
          "description": {
            "type": "string",
            "nullable": true
          },
          "owner_id": {
            "type": "integer"
          },
          "linux_user": {
            "type": "string",
            "nullable": true
          },
          "linux_pubkey": {
            "type": "string",
            "nullable": true
          },
          "linux_privkey": {
            "type": "string",
            "nullable": true,
            "example": "[KEY SET]"
          },
          "provision_root_path": {
            "type": "string",
            "nullable": true
          },
          "provisioned_at": {
            "type": "integer",
            "nullable": true
          },
          "members": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/User"
            }
          },
          "configs": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/SshConfig"
            }
          }
        }
      },
      "Permission": {
        "type": "object",
        "properties": {
          "id": {
            "type": "integer"
          },
          "target_type": {
            "type": "string",
            "enum": [
              "user",
              "group"
            ]
          },
          "target_id": {
            "type": "integer"
          },
          "config_id": {
            "type": "integer",
            "nullable": true
          },
          "can_read": {
            "type": "boolean"
          },
          "can_write": {
            "type": "boolean"
          },
          "can_delete": {
            "type": "boolean"
          },
          "can_terminal": {
            "type": "boolean"
          },
          "can_upload": {
            "type": "boolean"
          },
          "root_path": {
            "type": "string",
            "nullable": true
          }
        }
      },
      "AuditRow": {
        "type": "object",
        "properties": {
          "id": {
            "type": "integer"
          },
          "user_id": {
            "type": "integer"
          },
          "username": {
            "type": "string"
          },
          "action": {
            "type": "string"
          },
          "target": {
            "type": "string",
            "nullable": true
          },
          "detail": {
            "type": "string",
            "nullable": true
          },
          "ip": {
            "type": "string",
            "nullable": true
          },
          "created_at": {
            "type": "integer"
          }
        }
      },
      "SavedCommand": {
        "type": "object",
        "properties": {
          "id": {
            "type": "integer"
          },
          "user_id": {
            "type": "integer"
          },
          "label": {
            "type": "string"
          },
          "command": {
            "type": "string"
          }
        }
      },
      "Invite": {
        "type": "object",
        "properties": {
          "id": {
            "type": "integer"
          },
          "group_id": {
            "type": "integer"
          },
          "from_user_id": {
            "type": "integer"
          },
          "from_username": {
            "type": "string"
          },
          "group_name": {
            "type": "string"
          },
          "group_description": {
            "type": "string",
            "nullable": true
          },
          "status": {
            "type": "string",
            "enum": [
              "pending",
              "accepted",
              "declined"
            ]
          },
          "created_at": {
            "type": "integer"
          }
        }
      }
    }
  },
  "security": [
    {
      "bearerAuth": []
    }
  ],
  "tags": [
    {
      "name": "Auth",
      "description": "Login, register, current user"
    },
    {
      "name": "Users",
      "description": "User management & account settings"
    },
    {
      "name": "Configs",
      "description": "SSH connection configs"
    },
    {
      "name": "Files",
      "description": "SFTP file operations"
    },
    {
      "name": "Commands",
      "description": "Run commands & saved commands"
    },
    {
      "name": "Groups",
      "description": "Groups, members, provisioning"
    },
    {
      "name": "Invites",
      "description": "Group invite management"
    },
    {
      "name": "Admin",
      "description": "Permissions & audit log"
    }
  ],
  "paths": {
    "/auth/login": {
      "post": {
        "tags": [
          "Auth"
        ],
        "summary": "Login",
        "security": [],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "username",
                  "password"
                ],
                "properties": {
                  "username": {
                    "type": "string"
                  },
                  "password": {
                    "type": "string"
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "JWT + user",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "token": {
                      "type": "string"
                    },
                    "user": {
                      "$ref": "#/components/schemas/User"
                    }
                  }
                }
              }
            }
          },
          "401": {
            "description": "Invalid credentials"
          }
        }
      }
    },
    "/auth/register/public": {
      "post": {
        "tags": [
          "Auth"
        ],
        "summary": "Public self-registration (requires ALLOW_REGISTER=true)",
        "security": [],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "username",
                  "password"
                ],
                "properties": {
                  "username": {
                    "type": "string",
                    "minLength": 3
                  },
                  "password": {
                    "type": "string",
                    "minLength": 8
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Registered",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "token": {
                      "type": "string"
                    },
                    "user": {
                      "$ref": "#/components/schemas/User"
                    }
                  }
                }
              }
            }
          },
          "403": {
            "description": "Public registration disabled"
          },
          "409": {
            "description": "Username already taken"
          }
        }
      }
    },
    "/auth/register": {
      "post": {
        "tags": [
          "Auth"
        ],
        "summary": "Admin creates a new user",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "username",
                  "password"
                ],
                "properties": {
                  "username": {
                    "type": "string"
                  },
                  "password": {
                    "type": "string",
                    "minLength": 8
                  },
                  "role": {
                    "type": "string",
                    "enum": [
                      "user",
                      "admin"
                    ],
                    "default": "user"
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Created",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/User"
                }
              }
            }
          },
          "409": {
            "description": "Username exists"
          }
        }
      }
    },
    "/auth/me": {
      "get": {
        "tags": [
          "Auth"
        ],
        "summary": "Get current user",
        "responses": {
          "200": {
            "description": "Current user",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/User"
                }
              }
            }
          }
        }
      }
    },
    "/users": {
      "get": {
        "tags": [
          "Users"
        ],
        "summary": "List all users (admin only)",
        "responses": {
          "200": {
            "description": "Users",
            "content": {
              "application/json": {
                "schema": {
                  "type": "array",
                  "items": {
                    "$ref": "#/components/schemas/User"
                  }
                }
              }
            }
          }
        }
      }
    },
    "/users/{id}": {
      "patch": {
        "tags": [
          "Users"
        ],
        "summary": "Update user password or role (admin only)",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "password": {
                    "type": "string",
                    "minLength": 8
                  },
                  "role": {
                    "type": "string",
                    "enum": [
                      "user",
                      "admin"
                    ]
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Updated",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Ok"
                }
              }
            }
          },
          "404": {
            "description": "Not found"
          }
        }
      },
      "delete": {
        "tags": [
          "Users"
        ],
        "summary": "Delete user (admin only)",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Deleted",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Ok"
                }
              }
            }
          },
          "400": {
            "description": "Cannot delete yourself"
          },
          "404": {
            "description": "Not found"
          }
        }
      }
    },
    "/account/settings": {
      "get": {
        "tags": [
          "Users"
        ],
        "summary": "Get account settings",
        "responses": {
          "200": {
            "description": "Settings",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "user_id": {
                      "type": "integer"
                    },
                    "display_name": {
                      "type": "string",
                      "nullable": true
                    },
                    "email": {
                      "type": "string",
                      "nullable": true
                    },
                    "bio": {
                      "type": "string",
                      "nullable": true
                    },
                    "theme": {
                      "type": "string",
                      "enum": [
                        "dark",
                        "light"
                      ]
                    },
                    "language": {
                      "type": "string",
                      "enum": [
                        "uk",
                        "en"
                      ]
                    }
                  }
                }
              }
            }
          }
        }
      },
      "patch": {
        "tags": [
          "Users"
        ],
        "summary": "Update account settings",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "display_name": {
                    "type": "string"
                  },
                  "email": {
                    "type": "string"
                  },
                  "bio": {
                    "type": "string"
                  },
                  "theme": {
                    "type": "string",
                    "enum": [
                      "dark",
                      "light"
                    ]
                  },
                  "language": {
                    "type": "string",
                    "enum": [
                      "uk",
                      "en"
                    ]
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Updated",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Ok"
                }
              }
            }
          }
        }
      }
    },
    "/account/password": {
      "patch": {
        "tags": [
          "Users"
        ],
        "summary": "Change own password",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "current_password",
                  "new_password"
                ],
                "properties": {
                  "current_password": {
                    "type": "string"
                  },
                  "new_password": {
                    "type": "string",
                    "minLength": 8
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Changed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Ok"
                }
              }
            }
          },
          "401": {
            "description": "Wrong current password"
          }
        }
      }
    },
    "/configs": {
      "get": {
        "tags": [
          "Configs"
        ],
        "summary": "List SSH configs",
        "responses": {
          "200": {
            "description": "Configs",
            "content": {
              "application/json": {
                "schema": {
                  "type": "array",
                  "items": {
                    "$ref": "#/components/schemas/SshConfig"
                  }
                }
              }
            }
          }
        }
      },
      "post": {
        "tags": [
          "Configs"
        ],
        "summary": "Create SSH config",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "label",
                  "host",
                  "username"
                ],
                "properties": {
                  "label": {
                    "type": "string"
                  },
                  "host": {
                    "type": "string"
                  },
                  "port": {
                    "type": "integer",
                    "default": 22
                  },
                  "username": {
                    "type": "string"
                  },
                  "password": {
                    "type": "string"
                  },
                  "ssh_key": {
                    "type": "string"
                  },
                  "auth_type": {
                    "type": "string",
                    "enum": [
                      "password",
                      "key"
                    ]
                  },
                  "group_id": {
                    "type": "integer",
                    "nullable": true
                  },
                  "shared": {
                    "type": "boolean"
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Created",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "id": {
                      "type": "integer"
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/configs/{id}": {
      "delete": {
        "tags": [
          "Configs"
        ],
        "summary": "Delete SSH config",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Deleted",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Ok"
                }
              }
            }
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        }
      }
    },
    "/run": {
      "post": {
        "tags": [
          "Commands"
        ],
        "summary": "Execute a shell command on the remote server",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "allOf": [
                  {
                    "$ref": "#/components/schemas/SshTarget"
                  }
                ],
                "type": "object",
                "properties": {
                  "command": {
                    "type": "string",
                    "example": "ls -la"
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Output",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "stdout": {
                      "type": "string"
                    },
                    "stderr": {
                      "type": "string"
                    }
                  }
                }
              }
            }
          },
          "500": {
            "description": "Execution failed"
          }
        }
      }
    },
    "/saved-commands": {
      "get": {
        "tags": [
          "Commands"
        ],
        "summary": "List saved commands",
        "responses": {
          "200": {
            "description": "Commands",
            "content": {
              "application/json": {
                "schema": {
                  "type": "array",
                  "items": {
                    "$ref": "#/components/schemas/SavedCommand"
                  }
                }
              }
            }
          }
        }
      },
      "post": {
        "tags": [
          "Commands"
        ],
        "summary": "Save a command",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "label",
                  "command"
                ],
                "properties": {
                  "label": {
                    "type": "string"
                  },
                  "command": {
                    "type": "string"
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Saved",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/SavedCommand"
                }
              }
            }
          }
        }
      }
    },
    "/saved-commands/{id}": {
      "delete": {
        "tags": [
          "Commands"
        ],
        "summary": "Delete saved command",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Deleted",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Ok"
                }
              }
            }
          },
          "403": {
            "description": "Not your command"
          },
          "404": {
            "description": "Not found"
          }
        }
      }
    },
    "/files/list": {
      "post": {
        "tags": [
          "Files"
        ],
        "summary": "List directory contents",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "allOf": [
                  {
                    "$ref": "#/components/schemas/SshTarget"
                  }
                ],
                "type": "object",
                "properties": {
                  "path": {
                    "type": "string",
                    "example": "/home/user"
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Listing",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "path": {
                      "type": "string"
                    },
                    "items": {
                      "type": "array",
                      "items": {
                        "$ref": "#/components/schemas/FileItem"
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/files/read": {
      "post": {
        "tags": [
          "Files"
        ],
        "summary": "Read text file",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "allOf": [
                  {
                    "$ref": "#/components/schemas/SshTarget"
                  }
                ],
                "type": "object",
                "required": [
                  "path"
                ],
                "properties": {
                  "path": {
                    "type": "string"
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Content",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "content": {
                      "type": "string"
                    }
                  }
                }
              }
            }
          },
          "403": {
            "description": "Read access denied"
          }
        }
      }
    },
    "/files/write": {
      "post": {
        "tags": [
          "Files"
        ],
        "summary": "Write / create a file",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "allOf": [
                  {
                    "$ref": "#/components/schemas/SshTarget"
                  }
                ],
                "type": "object",
                "required": [
                  "path",
                  "content"
                ],
                "properties": {
                  "path": {
                    "type": "string"
                  },
                  "content": {
                    "type": "string"
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Written",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Ok"
                }
              }
            }
          },
          "403": {
            "description": "Write access denied"
          }
        }
      }
    },
    "/files/delete": {
      "post": {
        "tags": [
          "Files"
        ],
        "summary": "Delete file or directory (recursive)",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "allOf": [
                  {
                    "$ref": "#/components/schemas/SshTarget"
                  }
                ],
                "type": "object",
                "required": [
                  "path"
                ],
                "properties": {
                  "path": {
                    "type": "string"
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Deleted",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Ok"
                }
              }
            }
          },
          "403": {
            "description": "Delete access denied"
          }
        }
      }
    },
    "/files/rename": {
      "post": {
        "tags": [
          "Files"
        ],
        "summary": "Rename / move file or directory",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "allOf": [
                  {
                    "$ref": "#/components/schemas/SshTarget"
                  }
                ],
                "type": "object",
                "required": [
                  "from",
                  "to"
                ],
                "properties": {
                  "from": {
                    "type": "string"
                  },
                  "to": {
                    "type": "string"
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Renamed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Ok"
                }
              }
            }
          },
          "403": {
            "description": "Write access denied"
          }
        }
      }
    },
    "/files/mkdir": {
      "post": {
        "tags": [
          "Files"
        ],
        "summary": "Create directory (with parents)",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "allOf": [
                  {
                    "$ref": "#/components/schemas/SshTarget"
                  }
                ],
                "type": "object",
                "required": [
                  "path"
                ],
                "properties": {
                  "path": {
                    "type": "string"
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Created",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Ok"
                }
              }
            }
          },
          "403": {
            "description": "Write access denied"
          }
        }
      }
    },
    "/files/dirsize": {
      "post": {
        "tags": [
          "Files"
        ],
        "summary": "Get directory size (du -sh)",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "allOf": [
                  {
                    "$ref": "#/components/schemas/SshTarget"
                  }
                ],
                "type": "object",
                "required": [
                  "path"
                ],
                "properties": {
                  "path": {
                    "type": "string"
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Size",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "size": {
                      "type": "string",
                      "example": "1.2G"
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/files/tree": {
      "post": {
        "tags": [
          "Files"
        ],
        "summary": "Get directory tree",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "allOf": [
                  {
                    "$ref": "#/components/schemas/SshTarget"
                  }
                ],
                "type": "object",
                "properties": {
                  "path": {
                    "type": "string"
                  },
                  "depth": {
                    "type": "integer",
                    "default": 2,
                    "maximum": 4
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Tree",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "root": {
                      "type": "string"
                    },
                    "dirs": {
                      "type": "array",
                      "items": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/files/download": {
      "post": {
        "tags": [
          "Files"
        ],
        "summary": "Download a file (binary stream)",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "allOf": [
                  {
                    "$ref": "#/components/schemas/SshTarget"
                  }
                ],
                "type": "object",
                "required": [
                  "path"
                ],
                "properties": {
                  "path": {
                    "type": "string"
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Binary stream",
            "content": {
              "application/octet-stream": {
                "schema": {
                  "type": "string",
                  "format": "binary"
                }
              }
            }
          },
          "403": {
            "description": "No access"
          }
        }
      },
      "get": {
        "tags": [
          "Files"
        ],
        "summary": "Download via GET with token in query string",
        "parameters": [
          {
            "name": "token",
            "in": "query",
            "required": true,
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "path",
            "in": "query",
            "required": true,
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "configId",
            "in": "query",
            "schema": {
              "type": "integer"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Binary stream",
            "content": {
              "application/octet-stream": {
                "schema": {
                  "type": "string",
                  "format": "binary"
                }
              }
            }
          }
        }
      }
    },
    "/files/upload": {
      "post": {
        "tags": [
          "Files"
        ],
        "summary": "Upload a file",
        "requestBody": {
          "required": true,
          "content": {
            "multipart/form-data": {
              "schema": {
                "type": "object",
                "required": [
                  "file",
                  "path"
                ],
                "properties": {
                  "file": {
                    "type": "string",
                    "format": "binary"
                  },
                  "path": {
                    "type": "string"
                  },
                  "configId": {
                    "type": "integer"
                  },
                  "host": {
                    "type": "string"
                  },
                  "username": {
                    "type": "string"
                  },
                  "password": {
                    "type": "string"
                  },
                  "port": {
                    "type": "integer"
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Uploaded",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "ok": {
                      "type": "boolean"
                    },
                    "path": {
                      "type": "string"
                    }
                  }
                }
              }
            }
          },
          "403": {
            "description": "Upload access denied"
          }
        }
      }
    },
    "/groups": {
      "get": {
        "tags": [
          "Groups"
        ],
        "summary": "List all groups",
        "responses": {
          "200": {
            "description": "Groups",
            "content": {
              "application/json": {
                "schema": {
                  "type": "array",
                  "items": {
                    "$ref": "#/components/schemas/Group"
                  }
                }
              }
            }
          }
        }
      },
      "post": {
        "tags": [
          "Groups"
        ],
        "summary": "Create a group",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "name"
                ],
                "properties": {
                  "name": {
                    "type": "string"
                  },
                  "description": {
                    "type": "string"
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Created",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Group"
                }
              }
            }
          },
          "409": {
            "description": "Group exists"
          }
        }
      }
    },
    "/groups/{id}": {
      "delete": {
        "tags": [
          "Groups"
        ],
        "summary": "Delete group",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Deleted",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Ok"
                }
              }
            }
          },
          "403": {
            "description": "Only owner or admin"
          }
        }
      }
    },
    "/groups/{id}/members": {
      "post": {
        "tags": [
          "Groups"
        ],
        "summary": "Add member to group",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "user_id"
                ],
                "properties": {
                  "user_id": {
                    "type": "integer"
                  },
                  "group_role": {
                    "type": "string",
                    "enum": [
                      "owner",
                      "moderator",
                      "member"
                    ],
                    "default": "member"
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Added",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Ok"
                }
              }
            }
          }
        }
      }
    },
    "/groups/{id}/members/{uid}/role": {
      "patch": {
        "tags": [
          "Groups"
        ],
        "summary": "Change member role",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            }
          },
          {
            "name": "uid",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "group_role"
                ],
                "properties": {
                  "group_role": {
                    "type": "string",
                    "enum": [
                      "owner",
                      "moderator",
                      "member"
                    ]
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Updated",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Ok"
                }
              }
            }
          }
        }
      }
    },
    "/groups/{id}/members/{uid}": {
      "delete": {
        "tags": [
          "Groups"
        ],
        "summary": "Remove member from group",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            }
          },
          {
            "name": "uid",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Removed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Ok"
                }
              }
            }
          }
        }
      }
    },
    "/groups/{id}/invite": {
      "post": {
        "tags": [
          "Groups"
        ],
        "summary": "Send invite to a user",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "description": "user_id or username",
                "properties": {
                  "user_id": {
                    "type": "integer"
                  },
                  "username": {
                    "type": "string"
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Invite sent",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "id": {
                      "type": "integer"
                    }
                  }
                }
              }
            }
          },
          "409": {
            "description": "Already member or invite pending"
          }
        }
      }
    },
    "/groups/{id}/configs": {
      "post": {
        "tags": [
          "Groups"
        ],
        "summary": "Assign SSH config to group",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "config_id"
                ],
                "properties": {
                  "config_id": {
                    "type": "integer"
                  },
                  "access_role": {
                    "type": "string",
                    "enum": [
                      "admin",
                      "write",
                      "read"
                    ],
                    "default": "read"
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Assigned",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Ok"
                }
              }
            }
          }
        }
      }
    },
    "/groups/{id}/configs/{cid}": {
      "delete": {
        "tags": [
          "Groups"
        ],
        "summary": "Remove SSH config from group",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            }
          },
          {
            "name": "cid",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Removed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Ok"
                }
              }
            }
          }
        }
      }
    },
    "/groups/{id}/provision": {
      "post": {
        "tags": [
          "Groups"
        ],
        "summary": "Provision shared linux user & SSH key for group",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "provision_config_id"
                ],
                "properties": {
                  "provision_config_id": {
                    "type": "integer"
                  },
                  "provision_root_path": {
                    "type": "string",
                    "example": "/data/group1"
                  },
                  "sudo_password": {
                    "type": "string"
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Provisioned",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "ok": {
                      "type": "boolean"
                    },
                    "linux_user": {
                      "type": "string"
                    },
                    "root_path": {
                      "type": "string"
                    },
                    "config_id": {
                      "type": "integer"
                    }
                  }
                }
              }
            }
          },
          "500": {
            "description": "Provisioning failed"
          }
        }
      }
    },
    "/groups/{id}/share": {
      "post": {
        "tags": [
          "Groups"
        ],
        "summary": "Share a path with all group members (symlinks)",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "source_path",
                  "config_id"
                ],
                "properties": {
                  "source_path": {
                    "type": "string"
                  },
                  "config_id": {
                    "type": "integer"
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Shared",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "ok": {
                      "type": "boolean"
                    },
                    "linked": {
                      "type": "integer"
                    },
                    "warnings": {
                      "type": "array",
                      "items": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/invites": {
      "get": {
        "tags": [
          "Invites"
        ],
        "summary": "List pending invites for current user",
        "responses": {
          "200": {
            "description": "Invites",
            "content": {
              "application/json": {
                "schema": {
                  "type": "array",
                  "items": {
                    "$ref": "#/components/schemas/Invite"
                  }
                }
              }
            }
          }
        }
      }
    },
    "/invites/all": {
      "get": {
        "tags": [
          "Invites"
        ],
        "summary": "List all invites (admin only)",
        "responses": {
          "200": {
            "description": "All invites",
            "content": {
              "application/json": {
                "schema": {
                  "type": "array",
                  "items": {
                    "$ref": "#/components/schemas/Invite"
                  }
                }
              }
            }
          }
        }
      }
    },
    "/invites/{id}": {
      "patch": {
        "tags": [
          "Invites"
        ],
        "summary": "Accept or decline an invite",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "action"
                ],
                "properties": {
                  "action": {
                    "type": "string",
                    "enum": [
                      "accept",
                      "decline"
                    ]
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Processed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Ok"
                }
              }
            }
          },
          "400": {
            "description": "Already processed"
          },
          "403": {
            "description": "Forbidden"
          }
        }
      }
    },
    "/permissions": {
      "get": {
        "tags": [
          "Admin"
        ],
        "summary": "List all permissions (admin only)",
        "responses": {
          "200": {
            "description": "Permissions",
            "content": {
              "application/json": {
                "schema": {
                  "type": "array",
                  "items": {
                    "$ref": "#/components/schemas/Permission"
                  }
                }
              }
            }
          }
        }
      },
      "post": {
        "tags": [
          "Admin"
        ],
        "summary": "Create permission entry (admin only)",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "target_type",
                  "target_id"
                ],
                "properties": {
                  "target_type": {
                    "type": "string",
                    "enum": [
                      "user",
                      "group"
                    ]
                  },
                  "target_id": {
                    "type": "integer"
                  },
                  "config_id": {
                    "type": "integer",
                    "nullable": true
                  },
                  "can_read": {
                    "type": "boolean"
                  },
                  "can_write": {
                    "type": "boolean"
                  },
                  "can_delete": {
                    "type": "boolean"
                  },
                  "can_terminal": {
                    "type": "boolean"
                  },
                  "can_upload": {
                    "type": "boolean"
                  },
                  "root_path": {
                    "type": "string",
                    "nullable": true
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Created",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "id": {
                      "type": "integer"
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/permissions/{id}": {
      "delete": {
        "tags": [
          "Admin"
        ],
        "summary": "Delete permission entry (admin only)",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Deleted",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Ok"
                }
              }
            }
          }
        }
      }
    },
    "/audit": {
      "get": {
        "tags": [
          "Admin"
        ],
        "summary": "Get audit log (admin only)",
        "parameters": [
          {
            "name": "limit",
            "in": "query",
            "schema": {
              "type": "integer",
              "default": 100,
              "maximum": 500
            }
          },
          {
            "name": "offset",
            "in": "query",
            "schema": {
              "type": "integer",
              "default": 0
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Audit log",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "total": {
                      "type": "integer"
                    },
                    "rows": {
                      "type": "array",
                      "items": {
                        "$ref": "#/components/schemas/AuditRow"
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
};

module.exports = swaggerSpec;
