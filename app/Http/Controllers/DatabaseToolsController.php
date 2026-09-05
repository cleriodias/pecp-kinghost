<?php

namespace App\Http\Controllers;

use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;
use Throwable;

class DatabaseToolsController extends Controller
{
    private const ACTIONS = [
        'migrate' => [
            ['migrate', ['--force' => true]],
        ],
        'seed' => [
            ['db:seed', ['--force' => true]],
        ],
        'migrate-seed' => [
            ['migrate', ['--force' => true]],
            ['db:seed', ['--force' => true]],
        ],
    ];

    private const SINGLE_MIGRATE_ACTION = 'migrate-single';

    private const SINGLE_SEED_ACTION = 'seed-single';

    private const SEEDER_STATUS_PATH = 'seeders-status.json';

    private function ensureMaster($user): void
    {
        if (! $user || (int) $user->funcao !== 0) {
            abort(403);
        }
    }

    public function index(Request $request): Response
    {
        $this->ensureMaster($request->user());

        return Inertia::render('Settings/DatabaseTools', [
            'artisanOutput' => $request->session()->pull('artisan_output'),
            'artisanErrorDetail' => $request->session()->pull('artisan_error_detail'),
            'lastAction' => $request->session()->pull('artisan_action'),
            'environment' => app()->environment(),
            'migrationStatus' => $this->resolveMigrationStatus(),
            'seederStatus' => $this->resolveSeederStatus(),
        ]);
    }

    public function run(Request $request): RedirectResponse
    {
        $this->ensureMaster($request->user());

        $data = $request->validate([
            'action' => ['required', 'string', Rule::in(array_merge(array_keys(self::ACTIONS), [self::SINGLE_MIGRATE_ACTION, self::SINGLE_SEED_ACTION]))],
            'migration' => ['required_if:action,' . self::SINGLE_MIGRATE_ACTION, 'nullable', 'string'],
            'seeder' => ['required_if:action,' . self::SINGLE_SEED_ACTION, 'nullable', 'string'],
        ]);

        $action = $data['action'];
        $selectedMigration = $data['migration'] ?? null;
        $selectedSeeder = $data['seeder'] ?? null;
        $commands = [];
        $outputBlocks = [];
        $hasFailure = false;
        $commandResults = [];

        try {
            $commands = $this->commandsForAction($action, $data['migration'] ?? null, $data['seeder'] ?? null);

            foreach ($commands as [$command, $params]) {
                $exitCode = Artisan::call($command, $params);
                $rawOutput = trim(Artisan::output());
                $label = $command . ($exitCode === 0 ? '' : " (exit {$exitCode})");
                $outputBlocks[] = $rawOutput !== ''
                    ? $label . ":\n" . $rawOutput
                    : $label . ":\n" . '(sem saida)';
                if ($exitCode !== 0) {
                    $hasFailure = true;
                }
                $commandResults[$command] = $exitCode;
            }

            if (($commandResults['db:seed'] ?? null) === 0 && $action !== self::SINGLE_SEED_ACTION) {
                $this->writeSeederState($this->listSeederFiles());
            }

            $logContext = [
                'user_id' => $request->user()?->id,
                'action' => $action,
                'migration' => $selectedMigration,
                'seeder' => $selectedSeeder,
            ];

            if ($hasFailure) {
                Log::warning('Database tools completed with errors', $logContext);
            } else {
                Log::info('Database tools executed', $logContext);
            }

            if ($hasFailure) {
                return back()
                    ->with('error', 'Comando executado com erros. Consulte o log.')
                    ->with('artisan_output', implode("\n\n", $outputBlocks))
                    ->with('artisan_action', $action);
            }

            return back()
                ->with('success', 'Comando executado com sucesso.')
                ->with('artisan_output', implode("\n\n", $outputBlocks))
                ->with('artisan_action', $action);
        } catch (Throwable $e) {
            $errorDetail = $e->getMessage();
            $outputBlocks[] = implode("\n", array_filter([
                'Erro:',
                $errorDetail,
                'Arquivo: ' . $e->getFile() . ':' . $e->getLine(),
                $selectedMigration ? 'Migration: ' . $selectedMigration : null,
                $selectedSeeder ? 'Seeder: ' . $selectedSeeder : null,
            ]));

            Log::error('Database tools failed', [
                'user_id' => $request->user()?->id,
                'action' => $action,
                'migration' => $selectedMigration,
                'seeder' => $selectedSeeder,
                'error' => $e->getMessage(),
                'file' => $e->getFile(),
                'line' => $e->getLine(),
            ]);

            return back()
                ->with('error', 'Falha ao executar o comando. Consulte o log.')
                ->with('artisan_error_detail', $errorDetail)
                ->with('artisan_output', implode("\n\n", $outputBlocks))
                ->with('artisan_action', $action);
        }
    }

    private function commandsForAction(string $action, ?string $migrationName, ?string $seederName): array
    {
        if ($action === self::SINGLE_MIGRATE_ACTION) {
            $migration = $this->resolveMigrationByName((string) $migrationName);

            return [
                ['migrate', [
                    '--path' => $migration['path'],
                    '--realpath' => true,
                    '--force' => true,
                ]],
            ];
        }

        if ($action !== self::SINGLE_SEED_ACTION) {
            return self::ACTIONS[$action] ?? [];
        }

        $seeder = $this->resolveSeederByName((string) $seederName);

        return [
            ['db:seed', [
                '--class' => $seeder['class'],
                '--force' => true,
            ]],
        ];
    }

    private function resolveMigrationByName(string $migrationName): array
    {
        $normalized = pathinfo(basename($migrationName), PATHINFO_FILENAME);

        foreach ($this->listMigrationFiles() as $migration) {
            if ($migration['name'] === $normalized || $migration['file'] === basename($migrationName)) {
                return $migration;
            }
        }

        abort(422, 'Migration nao encontrada.');
    }

    private function resolveSeederByName(string $seederName): array
    {
        $normalized = basename($seederName);

        foreach ($this->listSeederFiles() as $seeder) {
            if ($seeder['name'] === $normalized) {
                return $seeder;
            }
        }

        abort(422, 'Seeder nao encontrado.');
    }

    private function resolveMigrationStatus(): array
    {
        try {
            $migrator = app('migrator');
            $files = $this->listMigrationFiles();
            $repository = $migrator->getRepository();
            $ran = $repository->repositoryExists() ? $repository->getRan() : [];

            $pendingNames = array_values(array_diff(array_column($files, 'name'), $ran));
            sort($pendingNames);

            $pending = collect($files)
                ->whereIn('name', $pendingNames)
                ->values()
                ->all();

            return [
                'total' => count($files),
                'ran' => count($ran),
                'pending' => $pending,
                'pending_count' => count($pending),
                'error' => null,
            ];
        } catch (Throwable $e) {
            Log::warning('Failed to resolve migration status', [
                'error' => $e->getMessage(),
            ]);

            return [
                'total' => 0,
                'ran' => 0,
                'pending' => [],
                'pending_count' => 0,
                'error' => 'Nao foi possivel ler o status das migrations.',
            ];
        }
    }

    private function listMigrationFiles(): array
    {
        $migrator = app('migrator');
        $files = $migrator->getMigrationFiles([database_path('migrations')]);

        return collect($files)
            ->map(fn (string $path, string $name) => [
                'name' => $name,
                'file' => basename($path),
                'path' => $path,
                'label' => $name,
            ])
            ->sortBy('name')
            ->values()
            ->all();
    }

    private function resolveSeederStatus(): array
    {
        $files = $this->listSeederFiles();
        $count = count($files);

        if ($count === 0) {
            return [
                'total' => 0,
                'files' => [],
                'pending' => false,
                'pending_reason' => 'none',
                'last_run_at' => null,
            ];
        }

        $fingerprint = $this->hashSeederFiles($files);
        $state = $this->readSeederState();
        $lastFingerprint = $state['fingerprint'] ?? null;
        $lastRunAt = $state['last_run_at'] ?? null;

        $pending = false;
        $pendingReason = 'none';

        if (! $lastFingerprint) {
            $pending = true;
            $pendingReason = 'never';
        } elseif ($fingerprint !== $lastFingerprint) {
            $pending = true;
            $pendingReason = 'changed';
        }

        return [
            'total' => $count,
            'files' => $files,
            'pending' => $pending,
            'pending_reason' => $pendingReason,
            'last_run_at' => $lastRunAt,
        ];
    }

    private function listSeederFiles(): array
    {
        $seedersPath = database_path('seeders');

        if (! File::isDirectory($seedersPath)) {
            return [];
        }

        $files = [];

        foreach (File::files($seedersPath) as $file) {
            if ($file->getExtension() !== 'php') {
                continue;
            }

            $files[] = [
                'name' => $file->getFilename(),
                'class' => 'Database\\Seeders\\' . $file->getFilenameWithoutExtension(),
                'label' => $file->getFilenameWithoutExtension(),
                'mtime' => $file->getMTime(),
            ];
        }

        usort($files, fn (array $a, array $b) => strcmp($a['name'], $b['name']));

        return $files;
    }

    private function hashSeederFiles(array $files): string
    {
        $payload = [];
        foreach ($files as $file) {
            $payload[$file['name']] = $file['mtime'];
        }
        ksort($payload);

        return hash('sha256', json_encode($payload));
    }

    private function readSeederState(): array
    {
        try {
            $disk = Storage::disk('local');
            if (! $disk->exists(self::SEEDER_STATUS_PATH)) {
                return [];
            }

            $raw = $disk->get(self::SEEDER_STATUS_PATH);
            $data = json_decode($raw, true);

            return is_array($data) ? $data : [];
        } catch (Throwable $e) {
            Log::warning('Failed to read seeder status', [
                'error' => $e->getMessage(),
            ]);
            return [];
        }
    }

    private function writeSeederState(array $files): void
    {
        $payload = [
            'last_run_at' => now()->toIso8601String(),
            'fingerprint' => $this->hashSeederFiles($files),
        ];

        Storage::disk('local')->put(self::SEEDER_STATUS_PATH, json_encode($payload));
    }
}
