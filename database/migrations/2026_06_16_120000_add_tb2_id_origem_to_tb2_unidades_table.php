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
            $table->unsignedBigInteger('tb2_id_origem')
                ->nullable()
                ->after('tb2_status');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('tb2_unidades', function (Blueprint $table) {
            $table->dropColumn('tb2_id_origem');
        });
    }
};
