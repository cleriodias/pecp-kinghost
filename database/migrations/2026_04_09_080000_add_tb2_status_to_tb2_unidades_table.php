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
        Schema::table('tb2_unidades', function (Blueprint $table) {
            $table->unsignedTinyInteger('tb2_status')
                ->default(1)
                ->after('tb2_localizacao');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('tb2_unidades', function (Blueprint $table) {
            $table->dropColumn('tb2_status');
        });
    }
};
