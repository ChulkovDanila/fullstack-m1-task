# Fullstack Test Task

Express + React приложение с двумя списками элементов, выбором, сортировкой и серверным хранением состояния в памяти.

## Локальный запуск

```bash
cd fullstack-m1-task
npm run install:all
```

В одном терминале:

```bash
npm run dev:server
```

Во втором терминале:

```bash
npm run dev:client
```

Клиент: `http://localhost:5173`  
Сервер: `http://localhost:4000`

## Production сборка

```bash
npm run build
npm start
```

После сборки сервер отдает клиент из `client/dist`.

## Docker

```bash
docker build -t fullstack-m1-task .
docker run -p 4000:4000 fullstack-m1-task
```

## Что реализовано

- Диапазон ID `1..1_000_000`
- Добавление новых ID вручную
- Два окна: доступные и выбранные
- Поиск по ID (substring)
- Infinite scroll в обоих списках, загрузка по 20
- Drag&Drop сортировка выбранных
- Состояние выбора и сортировки хранится на сервере в памяти
- Очереди с дедупликацией:
  - добавление: батч раз в 10 секунд
  - чтение/изменение: батч раз в 1 секунду
