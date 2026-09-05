<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->unsignedTinyInteger('funcao')->default(5)->after('password');
            $table->time('hr_ini')->nullable()->after('funcao');
            $table->time('hr_fim')->nullable()->after('hr_ini');
            $table->decimal('salario', 10, 2)->default(1518)->after('hr_fim');
            $table->decimal('vr_cred', 10, 2)->default(350)->after('salario');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn([
                'funcao',
                'hr_ini',
                'hr_fim',
                'salario',
                'vr_cred',
            ]);
        });
    }
};
