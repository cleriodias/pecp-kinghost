<?php

namespace App\Providers;

use Carbon\Carbon;
use Illuminate\Database\DatabaseManager;
use Illuminate\Pagination\Paginator;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\Facades\Vite;
use Illuminate\Support\ServiceProvider;
use Throwable;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        $appTimezone = env('APP_TIMEZONE', 'America/Sao_Paulo');
        $dbTimezone = env('DB_TIMEZONE', '-03:00');

        Config::set('app.timezone', $appTimezone);
        date_default_timezone_set($appTimezone);

        Date::useCallable(function ($date) use ($appTimezone) {
            return $date instanceof Carbon
                ? $date->copy()->setTimezone($appTimezone)
                : $date;
        });

        $this->app->afterResolving('db', function (DatabaseManager $databaseManager) use ($dbTimezone) {
            try {
                $connection = $databaseManager->connection();

                if (! in_array($connection->getDriverName(), ['mysql', 'mariadb'], true)) {
                    return;
                }

                $escapedTimezone = str_replace("'", "\\'", $dbTimezone);
                $connection->statement("SET time_zone = '{$escapedTimezone}'");
            } catch (Throwable $exception) {
                report($exception);
            }
        });

        $request = $this->app['request'];
        $forwardedProto = strtolower((string) $request->header('X-Forwarded-Proto', ''));
        $hasAzureSslHeader = $request->header('X-ARR-SSL') !== null;
        $configuredAppUrl = strtolower((string) config('app.url'));
        $shouldForceHttps =
            $this->app->environment('production') ||
            str_starts_with($configuredAppUrl, 'https://') ||
            $forwardedProto === 'https' ||
            $hasAzureSslHeader;

        if ($shouldForceHttps) {
            $forcedRootUrl = 'https://'.$request->getHttpHost();

            URL::forceRootUrl($forcedRootUrl);
            URL::forceScheme('https');
            Paginator::currentPathResolver(fn () => url($request->path()));
        }

        if (! $this->app->environment(['local', 'testing'])) {
            Vite::useHotFile(storage_path('framework/vite.hot'));
        }

        Vite::prefetch(concurrency: 3);
    }
}
