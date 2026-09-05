<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('users', 'payment_day')) {
            Schema::table('users', function (Blueprint $table) {
                $table->unsignedTinyInteger('payment_day')->nullable()->after('vr_cred');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('users', 'payment_day')) {
            Schema::table('users', function (Blueprint $table) {
                $table->dropColumn('payment_day');
            });
        }
    }
};
