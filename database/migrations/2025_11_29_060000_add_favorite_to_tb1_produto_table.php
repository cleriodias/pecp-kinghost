<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('tb1_produto', function (Blueprint $table) {
            $table->boolean('tb1_favorito')->default(false)->after('tb1_status');
        });
    }

    public function down(): void
    {
        Schema::table('tb1_produto', function (Blueprint $table) {
            $table->dropColumn('tb1_favorito');
        });
    }
};
