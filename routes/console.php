<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote')->hourly();

Artisan::command('fiscal:reactivate-tax-limit-blocks', function () {
    $reactivated = app(\App\Support\FiscalTaxLimitService::class)
        ->reactivateAutomaticGenerationForEligibleBlocks();

    $this->info("Lojas reativadas: {$reactivated}");
})->purpose('Reactivate fiscal automatic generation when tax limit blocks expire.');

Schedule::command('fiscal:reactivate-tax-limit-blocks')->dailyAt('00:05');
