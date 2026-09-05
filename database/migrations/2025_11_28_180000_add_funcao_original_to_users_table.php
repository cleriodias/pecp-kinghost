<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->tinyInteger('funcao_original')
                ->nullable()
                ->after('funcao');
        });

        DB::table('users')->update([
            'funcao_original' => DB::raw('funcao'),
        ]);
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('funcao_original');
        });
    }
};
