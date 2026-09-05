<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('users', 'chave_pix')) {
            Schema::table('users', function (Blueprint $table) {
                $table->string('chave_pix', 255)->nullable()->after('phone');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('users', 'chave_pix')) {
            Schema::table('users', function (Blueprint $table) {
                $table->dropColumn('chave_pix');
            });
        }
    }
};
