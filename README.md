# oServer — SSH File Manager

## Структура проекту

```
project/
├── server.js          ← Node.js бекенд (SSH + SFTP)
├── FileManager.tsx    ← React компонент (Next.js / Vite)
└── README.md
```

## Встановлення бекенду

```bash
npm init -y
npm install express cors ssh2 multer
node server.js
```

Бекенд запуститься на **http://localhost:3001**

## Встановлення фронтенду

### Next.js (App Router)

1. Скопіюй `FileManager.tsx` в `app/page.tsx` або `components/FileManager.tsx`
2. Встанови шрифт у `app/layout.tsx`:
   ```tsx
   import { Roboto_Mono } from 'next/font/google'
   const mono = Roboto_Mono({ subsets: ['latin'] })
   ```
3. Запусти: `npm run dev`

### Vite + React

1. Скопіюй `FileManager.tsx` в `src/App.tsx`
2. `npm run dev`

## API Endpoints

| Endpoint | Опис |
|---|---|
| `POST /run` | Виконати довільну SSH команду |
| `POST /files/list` | Список файлів в директорії |
| `POST /files/read` | Прочитати текстовий файл |
| `POST /files/write` | Зберегти файл |
| `POST /files/delete` | Видалити файл / директорію |
| `POST /files/rename` | Перейменувати / перемістити |
| `POST /files/mkdir` | Створити директорію |
| `POST /files/download` | Скачати файл (SFTP stream) |
| `POST /files/upload` | Завантажити файл (multipart) |
| `POST /files/tree` | Дерево директорій для сайдбару |
| `POST /system/metrics` | CPU/GPU temp, RAM, диски |

## Тіло запиту (для всіх endpoints)

```json
{
  "host": "127.0.0.1",
  "port": 22,
  "username": "jefrex",
  "password": "your_password",
  // + endpoint-специфічні поля
}
```

## Функції FileManager

- **Файловий менеджер** — grid перегляд, подвійний клік для входу в папку
- **Редактор** — вбудований текстовий редактор з збереженням
- **Термінал** — SSH термінал прямо в браузері
- **Upload/Download** — через SFTP
- **Метрики** — CPU, GPU температура, RAM, диски (оновлюється кожні 4с)
- **Дерево** — авто-завантаження структури папок в сайдбар
- **Пошук** — фільтрація файлів в реальному часі

## Примітки

- GPU температура потребує `nvidia-smi` на сервері
- CPU температура читається з `/sys/class/thermal/thermal_zone0/temp`
- Для продакшн-використання — додай JWT аутентифікацію та HTTPS
