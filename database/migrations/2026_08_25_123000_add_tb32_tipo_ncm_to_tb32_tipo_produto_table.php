<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('tb32_tipo_produto', 'tb32_tipo_ncm')) {
            return;
        }

        Schema::table('tb32_tipo_produto', function (Blueprint $table) {
            $table->unsignedTinyInteger('tb32_tipo_ncm')
                ->default(0)
                ->after('tb32_ncm');
        });
    }

    public function down(): void
    {
        if (! Schema::hasColumn('tb32_tipo_produto', 'tb32_tipo_ncm')) {
            return;
        }

        Schema::table('tb32_tipo_produto', function (Blueprint $table) {
            $table->dropColumn('tb32_tipo_ncm');
        });
    }
};
