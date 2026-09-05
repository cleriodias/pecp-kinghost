<?php

require_once __DIR__.'/compat.php';

if (! function_exists('array_first')) {
    /**
     * Return the first item from an array.
     *
     * @param  array  $array
     * @param  callable|null  $callback
     * @param  mixed  $default
     * @return mixed
     */
    function array_first(array $array, ?callable $callback = null, $default = null)
    {
        if ($callback === null) {
            return empty($array) ? $default : reset($array);
        }

        foreach ($array as $key => $value) {
            if ($callback($value, $key)) {
                return $value;
            }
        }

        return $default;
    }
}

if (! function_exists('array_last')) {
    /**
     * Return the last item from an array.
     *
     * @param  array  $array
     * @param  callable|null  $callback
     * @param  mixed  $default
     * @return mixed
     */
    function array_last(array $array, ?callable $callback = null, $default = null)
    {
        if ($callback === null) {
            return empty($array) ? $default : end($array);
        }

        $reversed = array_reverse($array, true);

        foreach ($reversed as $key => $value) {
            if ($callback($value, $key)) {
                return $value;
            }
        }

        return $default;
    }
}

if (! function_exists('array_find_key')) {
    /**
     * Return the first key in an array matching a callback.
     *
     * @param  array  $array
     * @param  callable  $callback
     * @param  mixed  $default
     * @return mixed
     */
    function array_find_key(array $array, callable $callback, $default = null)
    {
        foreach ($array as $key => $value) {
            if ($callback($value, $key)) {
                return $key;
            }
        }

        return $default;
    }
}

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

$app = Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        $middleware->trustProxies(at: '*');

        $middleware->web(append: [
            \App\Http\Middleware\EnsureActiveUser::class,
            \App\Http\Middleware\EnsureActiveUnit::class,
            \App\Http\Middleware\ApplyActiveRole::class,
            \App\Http\Middleware\HandleInertiaRequests::class,
            \Illuminate\Http\Middleware\AddLinkHeadersForPreloadedAssets::class,
        ]);

        $middleware->alias([
            'prevent-back-history' => \App\Http\Middleware\PreventBackHistory::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions) {
        //
    })
    ->create();

$storagePath = getenv('APP_STORAGE') ?: ($_ENV['APP_STORAGE'] ?? $_SERVER['APP_STORAGE'] ?? null);

if ($storagePath) {
    $storagePath = rtrim($storagePath, '/\\');
    $app->useStoragePath($storagePath);

    $paths = [
        $storagePath,
        $storagePath.'/app',
        $storagePath.'/app/public',
        $storagePath.'/app/private',
        $storagePath.'/framework',
        $storagePath.'/framework/cache',
        $storagePath.'/framework/cache/data',
        $storagePath.'/framework/sessions',
        $storagePath.'/framework/views',
        $storagePath.'/logs',
    ];

    foreach ($paths as $path) {
        if (!is_dir($path)) {
            mkdir($path, 0775, true);
        }
    }
}

return $app;
